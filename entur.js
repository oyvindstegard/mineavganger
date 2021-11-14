/**********************************************************************************
 * Mineavganger Entur API
 **********************************************************************************
 */

'use strict';

/* Generic throttled async function dispatch. Typical use case would be
   to throttle AJAX requests. Function calls are processed in FIFO order.

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
            const dispatch = queue.shift();
            ++inFlight;
            dispatch.func()
                .then(dispatch.deferred.resolve)
                .catch(dispatch.deferred.reject)
                .then(function() { --inFlight; });
        }
        delayTimer = queue.length > 0 ? setTimeout(processQueue, self.delayMillis) : null;
    };

    /* Enqueues an async function execution, possibly delaying it if too many
       concurrent calls are in flight. Returns a promise. */
    this.enqueue = function(asyncFunc) {
        const deferred = $.Deferred();
        queue.push({func: asyncFunc, deferred: deferred});
        processQueue();
        return deferred.promise();
    };
};

/* Entur JourneyPlanner and Geocoder APIs. */
const Entur = new function() {

    const journeyPlannerApi = 'https://api.entur.io/journey-planner/v2/graphql';

    const geocoderAutocompleteApi = 'https://api.entur.io/geocoder/v1/autocomplete';

    // Norwegian county ids, eastern parts, https://no.wikipedia.org/wiki/Fylkesnummer
    const defaultGeocoderCountyIds = ['03','30','34','38'];

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

    // Make trips query limited by 'from', 'to' and a single mode of transportation
    this.graphqlQuery = function (fromPlaceId, toPlaceId, mode, numTripPatterns) {
        return {
            query: `query trips($from: Location!, $to: Location!, $modes: [Mode], $numTripPatterns: Int = 3)
                {
                  trip(from: $from, to: $to, modes: $modes, numTripPatterns: $numTripPatterns) {
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
                modes: (mode ? [mode] : null),
                numTripPatterns: (numTripPatterns ? numTripPatterns : null)
            }
        };
    };

    const getEnturClientName = function() {
        return 'private-' + (window.location.hostname ?
                             window.location.hostname.replace(/[.-]/g, '_') : 'unknown');
    };

    const throttledDispatcher = new ThrottledDispatcher(1, 100);
    
    /* Post to JourneyPlanner API: GraphQL payload wrapped in JSON container.
       This function throttles number of concurrent requests to avoid request
       rate penalties from JourneyPlanner API. It returns a promise.
    */
    this.fetchJourneyPlannerResults = function(graphqlQuery) {
        return throttledDispatcher.enqueue(function() {
            return $.post({
                url: journeyPlannerApi,
                data: JSON.stringify(graphqlQuery),
                dataType: 'json',
                contentType: 'application/json',
                headers: { 'ET-Client-Name': getEnturClientName() },
            });
        });
    };

    /* Geocoder autocomplete for stops.
       Results are simplified to only contain list of labels and stop ids
    */
    this.fetchGeocoderResults = function(text, successCallback, transportMode, countyIds) {

        const params = self.getGeocoderAutocompleteApiParams(transportMode, countyIds);
        params.text = text;
        
        return $.get({
            url: geocoderAutocompleteApi,
            data: params,
            headers: self.getGeocoderAutocompleteApiHeaders(),
            success: function(data) {
                successCallback(data.features.map(function(feature) {
                    return {
                        'label': feature.properties.label,
                        'stopPlaceId': feature.properties.id
                    };
                }));
            }
        });
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
            'ET-Client-Name': getEnturClientName()
        };
    };
    
};

/* Local Variables: */
/* js2-additional-externs: ("$") */
/* End: */
