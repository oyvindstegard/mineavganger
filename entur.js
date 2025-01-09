/**********************************************************************************
 * Mineavganger Entur API
 * Bruker Geocoder V1 og JourneyPlanner V3.
 **********************************************************************************
 */

'use strict';

/* Generic throttled async function dispatch. Typical use case would be
   to throttle fetch requests. Function calls are processed in FIFO order.

   maxConcurrency: max number of concurrently dispatched async operations.
   delayMillis: milliseconds to delay if concurrency is at max when new function
                 calls are enqueued. */
const ThrottledDispatcher = function(maxConcurrency, delayMillis) {

    this.maxConcurrency = maxConcurrency;
    this.delayMillis = delayMillis;
    const self = this;

    const queue = [];
    var inFlight = 0;
    var delayTimer = null;
    const processQueue = function() {
        if (delayTimer) {
            clearTimeout(delayTimer);
        }
        while (queue.length > 0 && inFlight < self.maxConcurrency) {
            const {func, resolve, reject} = queue.shift();
            ++inFlight;
            func()
                .then(resolve)
                .catch(reject)
                .finally(() => { --inFlight; });
        }
        delayTimer = queue.length > 0 ? setTimeout(processQueue, self.delayMillis) : null;
    };

    /* Enqueues an async function execution, possibly delaying it if too many
       concurrent calls are in flight. Returns a Promise. */
    this.enqueue = function(asyncFunc) {
        return new Promise((resolve, reject) => {
            queue.push({func: asyncFunc, resolve, reject});
            processQueue();
        });
    };
};

/* Entur JourneyPlanner and Geocoder APIs. */
const Entur = new function() {

    const journeyPlannerApi = 'https://api.entur.io/journey-planner/v3/graphql';

    const geocoderAutocompleteApi = 'https://api.entur.io/geocoder/v1/autocomplete';

    // Norwegian county ids, eastern parts, https://no.wikipedia.org/wiki/Fylkesnummer
    const defaultGeocoderCountyIds = ['03','31','32','33','34','39','40'];

    // Transportation modes to geocoder stop categories
    const transportModeGeocoderCategories = {
        'bus': ['onstreetBus','busStation','coachStation'],
        'tram': ['onstreetTram', 'tramStation'],
        'rail': ['railStation'],
        'metro': ['metroStation']
    };

    /* Display language translations for transportation modes */
    const TransportMode = function(mode, name, place, symbolEntity) {
        this.mode = function() { return mode; };
        this.name = function(capitalize) {
            return capitalize ? name.charAt(0).toUpperCase() + name.slice(1) : name;
        };
        this.place = function(capitalize) {
            return capitalize ?
                place.charAt(0).toUpperCase() + place.slice(1) : place;
        };
        this.symbolEntity = function() { return symbolEntity; };
    };
    
    this.transportModes = {
        'bus': new TransportMode('bus', 'buss', 'holdeplass', '&#x1f68c;'),
        'tram': new TransportMode('tram', 'trikk', 'holdeplass', '&#x1F68B;'),
        'metro': new TransportMode('metro', 't-bane', 'stasjon', '&#x1F687;'),
        'rail': new TransportMode('rail', 'tog', 'stasjon', '&#x1F686;')
    };

    this.tripQueryDefaults = {
        'numTripPatterns': 3,
        'searchWindow': 360,
    };

    // Makes a trip GraphQL query limited by 'from', 'to' and a single mode of transportation.
    // Returns an object with keys 'query' and 'variables'.
    this.makeTripQuery = function (fromPlaceId, toPlaceId, mode, numTripPatterns, searchWindow) {
        return {
            query: `query trips($from: Location!, $to: Location!, $mode: TransportMode,
                                $numTripPatterns: Int!, $searchWindow: Int!)
                {
                  trip(from: $from, to: $to, numTripPatterns: $numTripPatterns, modes: {transportModes: {transportMode: $mode }}, maximumTransfers: 1, searchWindow: $searchWindow)
                  {
                    tripPatterns {
                      legs {
                        authority {
                          name
                        }
                        fromPlace {
                          name
                        }
                        toPlace {
                          name
                        }
                        fromEstimatedCall {
                          expectedDepartureTime
                          aimedDepartureTime
                          destinationDisplay {
                            frontText
                          }
                          quay {
                            publicCode
                          }
                        }
                        line {
                          name
                          id
                          publicCode
                          presentation {
                            colour
                            textColour
                          }
                        }
                        situations {
                          summary {
                            value
                            language
                          }
                          description {
                            value
                            language
                          }
                          validityPeriod {
                            startTime
                            endTime
                          }
                        }
                        mode
                      }
                    }
                  }
                }`,
            variables: {
                from: {
                    place: fromPlaceId
                },
                to: {
                    place: toPlaceId
                },
                mode: mode ? mode : null,
                numTripPatterns: (numTripPatterns ?
                                  numTripPatterns : this.tripQueryDefaults.numTripPatterns),
                searchWindow: (searchWindow ?
                               searchWindow : this.tripQueryDefaults.searchWindow)
            }
        };
    };

    const getEnturClientName = function() {
        return 'private-' + (window.location.hostname ?
                             window.location.hostname.replace(/[.-]/g, '_') : 'unknown');
    };

    const throttledDispatcher = new ThrottledDispatcher(1, 50);

    /* Post to JourneyPlanner API: GraphQL payload wrapped in JSON container.
       This function throttles number of concurrent requests to avoid request
       rate penalties from JourneyPlanner API. It returns a promise.
       A single retry with backoff is also part of this function.
    */
    this.fetchJourneyPlannerResults = function(graphqlQuery) {
        const requestFunc = () => {
            const request = new Request(journeyPlannerApi, {
                body: JSON.stringify(graphqlQuery),
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-type': 'application/json',
                    'Accept': 'application/json',
                    'ET-Client-Name': getEnturClientName()
                }
            });

            return fetch(request).then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }

                return response.json();
            });
        };
        
        return throttledDispatcher.enqueue(requestFunc)
            .catch(function(err) {
                console.error(`JourneyPlanner request failed: ${err}`);
                // Back off 5 secs and retry once
                return new Promise((resolve, reject) => {
                    setTimeout(resolve, 5000);
                }).then(() => throttledDispatcher.enqueue(requestFunc));
            });
    };

    /*
     * Fetch geocoder suggestions.
     * Returns a Promise which resolves to a JSON object on success.
     */
    this.fetchGeocoderResults = async function(text, transportMode, abortSignal) {
        const countyIds = defaultGeocoderCountyIds;

        const url = new URL(geocoderAutocompleteApi);
        url.searchParams.set('boundary.county_ids', countyIds.join(','));
        url.searchParams.set('size', 20);
        url.searchParams.set('layers', 'venue');
        url.searchParams.set('categories', transportModeGeocoderCategories[transportMode].join(','));
        url.searchParams.set('text', text);
        
        const request = new Request(url, {
            method: 'GET',
            mode: 'cors',
            signal: abortSignal,
            headers: {
                'Accept': 'application/json',
                'ET-Client-Name': getEnturClientName()
            }
        });

        const response = await fetch(request);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        return response.json();
    };

    this.getGeocoderAutocompleteApiUrl = function() {
        return geocoderAutocompleteApi;
    };

    this.getGeocoderAutocompleteApiQueryParamName = function() {
        return 'text';
    };

    /* Returns object with jQuery AJAX settings for a geocoder request */
    this.getGeocoderAutocompleteApiParams = function(transportMode, countyIds) {
        if (!countyIds) {
            countyIds = defaultGeocoderCountyIds;
        }
        return {
            'boundary.county_ids': countyIds.join(','),
            'size': 20,
            'layers': 'venue',
            'categories': transportModeGeocoderCategories[transportMode].join(',')
        };
    };

    /* Returns required http-headers for geocoder API calls */
    this.getGeocoderAutocompleteApiHeaders = function() {
        return {
            'Accept': 'application/json',
            'ET-Client-Name': getEnturClientName()
        };
    };
    
};

/* Local Variables: */
/* js2-additional-externs: ("Request" "URL") */
/* End: */
