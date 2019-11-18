/**********************************************************************************
 * JavaScript/HTML 5 web app for personalized display of departures using Entur
 * JourneyPlanner API. The code currently relies on jQuery. It also uses some
 * raw ES6 features, which limits browser support to modern stuff.
 * 
 * Author: Øyvind Stegard <oyvind@stegard.net>
 * License: GPL-3
 *
 * Code uses the following libraries, which are all MIT-licensed:
 * - jQuery, https://jquery.com/
 * - Ajax AutoComplete for jQuery,
 *   https://www.devbridge.com/sourcery/components/jquery-autocomplete/
 **********************************************************************************
 */

'use strict';

/* Simple local browser storage of personal departures. */
const Storage = new function() {

    const db = window.localStorage;
    const self = this;
    
    const setDepartures = function(departures) {
        db.setItem('departures', JSON.stringify(departures));
        return departures;
    };

    /* Returns all stored departures as an array. */
    this.getDepartures = function() {
        const list = db.getItem('departures');
        return list ? JSON.parse(list) : [];
    };

    /* Adds a departure. Assigns an 'id' property automatically to object, if not
       already present. */
    this.addDeparture = function(d, insertAsFirst) {
        const list = self.getDepartures();
        if (!d.id) {
            d.id = list.map(function (d) {
                return d.id;
            }).reduce(function(max, n) {
                return n > max ? n : max
            }, 0) + 1;
        }
        if (insertAsFirst) {
            list.unshift(d);
        } else {
            list.push(d);
        }
        setDepartures(list);
        return d;
    };

    /* Removes a departure by id, returns the removed departure. */
    this.removeDeparture = function(id) {
        var departureToRemove;
        setDepartures(self.getDepartures().filter(function(d) {
            if (id === d.id) {
                departureToRemove = d;
                return false;
            }
            return true;
        }));
        return departureToRemove;
    };

    const moveDeparture = function(departureId, first) {
        const departures = self.getDepartures();
        const departureToMove = departures.findIndex(function(d) { return d.id === departureId; });
        if (departureToMove > -1) {
            const departure = departures[departureToMove];
            departures.splice(departureToMove,1);
            if (first) {
                departures.unshift(departure);
            } else {
                departures.push(departure);
            }
            setDepartures(departures);
            return departure;
        }
    };

    /* Moves an existing departure to first position in list.
       Returns moved departure. */
    this.moveFirst = function(departureId) {
        return moveDeparture(departureId, true);
    };

    /* Moves an existing departure to last position in list.
       Returns moved departure. */
    this.moveLast = function(departureId) {
        return moveDeparture(departureId, false);
    };

    this.removeAll = function() {
        return setDepartures([]);
    };
};

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

    // Norwegian county ids, https://no.wikipedia.org/wiki/Fylkesnummer
    const defaultGeocoderCountyIds = ['01','02','03','04','05','06','07','08'];

    // Transportation modes to geocoder stop categories
    const transportModeGeocoderCategories = {
        'bus': ['onstreetBus','busStation','coachStation'],
        'tram': ['onstreetTram', 'tramStation'],
        'rail': ['railStation'],
        'metro': ['metroStation']
    };

    // Make trips query limited by 'from', 'to' and a single mode of transportation
    this.graphqlQuery = function (fromPlaceId, toPlaceId, mode, numTripPatterns) {
        return {
            query: `query trips($from: Location!, $to: Location!, $modes: [Mode], $numTripPatterns: Int = 3)
                {
                  trip(from: $from, to: $to, modes: $modes, numTripPatterns: $numTripPatterns) {
                    tripPatterns {
                      startTime
                      duration
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
    }

    const getEnturClientName = function() {
        return window.location.hostname ?
            window.location.hostname.replace(/[.-]/g, '_') + ' - private' : 'unknown - private';
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
    this.fetchGeocoderResults = function(text, successCallback, transportMode,
                                         countyIds = defaultGeocoderCountyIds) {
        return $.get({
            url: geocoderAutocompleteApi,
            data: { 'text': text,
                    'boundary.county_ids': countyIds.join(','),
                    'size': 20,
                    'layers': 'venue',
                    'categories': transportModeGeocoderCategories[transportMode].join(',') },
            headers: { 'ET-Client-Name': getEnturClientName() },
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

    /* Returns jQuery AJAX settings for geocoder API calls */
    this.getGeocoderAutocompleteApiAjaxSettings = function() {
        return {
            dataType: 'json',
            headers: {
                'ET-Client-Name': getEnturClientName()
            }
        };
    };

    /* Display language translation map for transportation modes */
    this.transportationModes = function() {
        return {
            'bus': ['buss', 'holdeplass'],
            'tram': ['trikk', 'holdeplass'],
            'metro': ['t-bane', 'stasjon'],
            'rail': ['tog', 'stasjon']
        };
    };
};

/* Entur Geocoder autocomplete using jQuery autocomplete plugin. */
const GeocoderAutocomplete = function(inputElement, transportMode, Entur, onSelect, onInvalidate) {

    const autocomplete = inputElement.autocomplete({
        serviceUrl: Entur.getGeocoderAutocompleteApiUrl(),
        paramName: Entur.getGeocoderAutocompleteApiQueryParamName(),
        params: Entur.getGeocoderAutocompleteApiParams(transportMode),
        ajaxSettings: Entur.getGeocoderAutocompleteApiAjaxSettings(),
        onSelect: onSelect,
        onInvalidateSelection: onInvalidate,
        minChars: 2,
        transformResult: function(response, originalQuery) {
            const suggestions = response.features.map(function(feature) {
                return {
                    'value': feature.properties.label,
                    'data': feature.properties.id
                }
            });
            return {
                suggestions: suggestions
            };
        }
    }).autocomplete();

    this.dispose = function() {
        autocomplete.dispose();
    };
    
};

const ViewportUtils = {
    /* Ensure that bottom of an element is completely visible in viewport,
     * scroll if necessary. */
    ensureLowerVisibility: function(element, delay) {
        const viewportLower = $(window).scrollTop() + $(window).height();
        const elementLower = $(element).offset().top + $(element).outerHeight();
        const pixelsBelow = elementLower - viewportLower;
        if (pixelsBelow > -10) {
            if (delay) {
                setTimeout(function() { window.scrollBy(0, pixelsBelow + 10); }, delay);
            } else {
                window.scrollBy(0, pixelsBelow + 10);
            }
        }
    }
};

/* Departure input form support. */
const DepartureInput = new (function(Entur) {

    const self = this;

    const getNewDepartureForm = function(transportMode, addCallback) {
        const modeDesc = Entur.transportationModes()[transportMode];

        // Title
        const titleInputLabel = $('<label/>', { for: 'titleInput' }).text('Tittel (automatisk generert)');
        const titleInput = $('<input/>', {
            id: 'titleInput',
            type: 'text',
            readonly: 'readonly',
            title: titleInputLabel.text(),
            placeholder: 'Ny avgang med ' + modeDesc[0]
        });

        // Stop place from
        const placeFromInputLabel = $('<label/>', { for: 'placeFromInput' }).text('Fra ' + modeDesc[1]);
        const placeFromInvalid = $('<span/>', {id:'placeFromInvalid', class:'invalid'}).text('Ikke funnet.');
        const placeFromInput = $('<input/>', {
            id: 'placeFromInput',
            type: 'text',
            title: 'Fra ' + modeDesc[1],
            placeholder: 'Fra ' + modeDesc[1]
        });

        // Stop place to
        const placeToInputLabel = $('<label/>', { for: 'placeToInput' }).text('Til ' + modeDesc[1]);
        const placeToInvalid = $('<span/>', {id:'placeToInvalid', class:'invalid'}).text('Ikke funnet.');
        const placeToInput = $('<input/>', {
            id: 'placeToInput',
            type: 'text',
            title: 'Til ' + modeDesc[1],
            placeholder: 'Til ' + modeDesc[1]
        });

        const updateTitle = function() {
            var title = '';
            if (placeFromInput.data('stopPlace')) {
                title = 'Fra ' + placeFromInput.data('stopPlace').replace(/,.*$/,'');
            }
            if (placeToInput.data('stopPlace')) {
                if (!title) {
                    title = '...';
                }
                title += ' til ' + placeToInput.data('stopPlace').replace(/,.*$/,'');
            }
            titleInput.val(title);
        };

        const validateInputs = function(ev) {
            var ok = true;

            if (placeFromInput.val() !== placeFromInput.data('stopPlace')) {
                placeFromInvalid.show();
                placeFromInput.addClass('invalid');
                ok = false;
            } else {
                placeFromInput.removeClass('invalid');
                placeFromInvalid.hide();
            }

            if (placeToInput.val() !== placeToInput.data('stopPlace')) {
                placeToInvalid.show();
                placeToInput.addClass('invalid');
                ok = false;
            } else {
                placeToInput.removeClass('invalid');
                placeToInvalid.hide();
            }
            
            return ok;
        };
        
        const fromAutocomplete = new GeocoderAutocomplete(placeFromInput, transportMode, Entur, function(s) {
            $(this).data('stopPlaceId', s.data).data('stopPlace', s.value);
            updateTitle();
        }, function() {
            $(this).data('stopPlaceId', null).data('stopPlace', null);
        });
        const toAutocomplete = new GeocoderAutocomplete(placeToInput, transportMode, Entur, function(s) {
            $(this).data('stopPlaceId', s.data).data('stopPlace', s.value);
            updateTitle();
        }, function() {
            $(this).data('stopPlaceId', null).data('stopPlace', null);
        });

        return $('<form/>', { 'id': 'newDepartureForm',
                              'class': 'newDeparture',
                              'autocomplete': 'off' }) // Disable native "history" auto-completion
            .append(titleInput, titleInputLabel)
            .append($('<ul/>',{class:'departureList'})
                    .append($('<li/>').append(placeFromInput, placeFromInputLabel, placeFromInvalid),
                            $('<li/>').append(placeToInput, placeToInputLabel, placeToInvalid)))
            .append($('<button/>', {
                text: 'Legg til',
                id: 'departureSubmit',
                type: 'submit',
                click: validateInputs
            }))
            .append($('<button/>', {
                type: 'button',
                text: 'Avbryt',
                click: function(ev) {
                    ev.preventDefault();
                    fromAutocomplete.dispose();
                    toAutocomplete.dispose();
                    $('#newDepartureForm').replaceWith(self.getNewDepartureButtons(addCallback));
                }
            }))
            .submit(function(ev) {
                fromAutocomplete.dispose();
                toAutocomplete.dispose();
                addCallback({
                    placeFrom: {
                        stopId: placeFromInput.data('stopPlaceId'),
                        name: placeFromInput.data('stopPlace')
                    },
                    placeTo: {
                        stopId: placeToInput.data('stopPlaceId'),
                        name: placeToInput.data('stopPlace')
                    },
                    title: titleInput.val(),
                    mode: transportMode
                });
                return true;
            });
    }
    
    this.getNewDepartureButtons = function(addCallback) {
        return $('<section/>', {id: 'newDepartureButtons'}).append(
            $.map(Entur.transportationModes(),
                  function (modeDesc, transportMode) {
                      const buttonText = '+'
                            + modeDesc[0].charAt(0).toUpperCase() + modeDesc[0].slice(1);
                      return $('<button/>', {class:'newDeparture'}).text(buttonText)
                          .click(function(e) {
                              e.preventDefault();
                              $('#newDepartureButtons').replaceWith(
                                  getNewDepartureForm(transportMode, addCallback));
                              $('#placeFromInput').focus();
                              ViewportUtils.ensureLowerVisibility($('#departureSubmit'), 750);
                          });
                  }));
    };
    
})(Entur);

/* Dropdown menus support. */
const DropdownMenu = new function() {

    var globalCloseDropdownsHandlerRegistered = false;
    const registerGlobalCloseDropdownsHandler = function () {
        if (globalCloseDropdownsHandlerRegistered) {
            return;
        } else {
            globalCloseDropdownsHandlerRegistered = true;
        }
        $(window).click(function (ev) {
            $('div.Dropdown__menu').each(function (idx, e) { $(e).hide(); });
        });
    };

    var idSequence = 0;

    /* Create a new dropdown menu with a button and custom actions. */
    this.newDropdownMenu = function(title, actions) {
        registerGlobalCloseDropdownsHandler();

        const nextId = ++idSequence;

        return $('<div/>', {class: 'Dropdown__container', id: 'Dropdown__container-' + nextId})
            .append($('<button/>', {class: 'Dropdown__button',
                                    id: 'Dropdown__button-' + nextId,
                                    title: title})
                    .append($('<img/>', { src: 'menu.svg', width: '16', height: '16', alt: 'Meny-symbol' }))
                    .click(function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        const thisMenuId = 'Dropdown__menu-' + nextId;
                        $('.Dropdown__menu').each(function(idx, e) {
                            if (e.id === thisMenuId) {
                                if ($(e).toggle().is(':visible')) {
                                    ViewportUtils.ensureLowerVisibility(e);
                                }
                            } else {
                                $(e).hide();
                            }
                        });
                    })
                   )
            .append($('<div/>', {class: 'Dropdown__menu Dropdown__menuborder',
                                 id: 'Dropdown__menu-' + nextId})
                    .append($.map(actions, function(val, key) {
                        return $('<button/>', { class:'Dropdown__item' }).html(key).click(val);
                    }))
                   );
    };
};

// Date extensions
// Compat with Safari/IOS
Date.parseIsoCompatible = function(iso8601) {
    return new Date(iso8601.replace(/\+([0-9]{2})([0-9]{2})$/, "+$1:$2"));
}
Date.prototype.diffMinutes = function(laterDate) {
    return Math.floor((laterDate - this) / 1000 / 60);
}
Date.prototype.hhmm = function() {
    var mins = this.getMinutes() < 10 ? '0' + this.getMinutes() : this.getMinutes();
    var hours = this.getHours() < 10 ? '0' + this.getHours() : this.getHours();
    return hours + ':' + mins;
}

function getPlatformElement(trip) {
    return (trip.legs[0].fromEstimatedCall.quay &&
            trip.legs[0].fromEstimatedCall.quay.publicCode) ?
        $('<span/>', {
            'class': 'platformCode',
            'html': trip.legs[0].fromEstimatedCall.quay.publicCode,
            'title': 'Plattform ' + trip.legs[0].fromEstimatedCall.quay.publicCode
        })
        :
        $('<span/>');
}

function getLineCodeElement(trip) {
    const name = trip.legs[0].fromEstimatedCall.destinationDisplay.frontText;
    const publicCode = trip.legs[0].line.publicCode;
    const bgcolor = trip.legs[0].line.presentation.colour || '888';
    const fgcolor = trip.legs[0].line.presentation.textColour || 'FFF';

    return $('<span/>', {
        'class': 'lineCode',
        'html': publicCode
    }).css({'color':'#'+fgcolor,'background-color':'#' + bgcolor}).prop('title', name);
}

function getTimeElements(trip, displayMinutesToStart) {
    const now = new Date();
    const startTime = Date.parseIsoCompatible(trip.startTime);
    const aimedTime = Date.parseIsoCompatible(trip.legs[0].fromEstimatedCall.aimedDepartureTime);
    const minutesDelayed = Math.max(0, aimedTime.diffMinutes(startTime));
    var minutesToStart = Math.max(0, now.diffMinutes(startTime));
    
    if (minutesToStart == 0) {
        minutesToStart = 'nå';
    } else if (minutesToStart < 60) {
        minutesToStart = 'om ' + minutesToStart + (minutesToStart > 1 ? ' minutter' : ' minutt');
    } else {
        minutesToStart = 'over én time';
    }

    return $('<span/>', {
        'class': 'startTime',
        'html': (minutesDelayed > 0 ? '<strike>'+aimedTime.hhmm()+'</strike><span class="startTimeDelayed">' + startTime.hhmm() + '</span>' : startTime.hhmm())
            + (displayMinutesToStart ? ' (' + minutesToStart + ')' : '')
    });
}

function showDepartureLoader(el) {
    const contentHeight = Math.max(16, $(el).height());
    const loaderEl = $('<ul/>', {class:'departureList', height:contentHeight}).append(
        $('<li/>').append($('<img/>', { src: 'departures128.png', class:'loader' })));
    $(el).replaceWith(loaderEl);
}

function spinOnce(el) {
    if (! (el instanceof jQuery)) {
        el = $(el);
    }
    el.replaceWith(el.clone().addClass('spinonce'));
}

function updateDeparture(el) {
    el = $(el);
    if (el.data('loading')) {
        return;
    } else {
        el.data('loading', true);
    }
    
    showDepartureLoader($('ul.departureList', el).get(0));

    // Query criteria are attached to DOM as data-attributes
    const data = el.data();
    const numTrips = data.numTrips || 3;
    const mode = data.mode;
    const placeFrom = data.placeFromId;
    const placeTo = data.placeToId;

    Entur.fetchJourneyPlannerResults(Entur.graphqlQuery(placeFrom, placeTo, mode, numTrips))
        .then(function(result) {
            const listItems = $.map(result.data.trip.tripPatterns, function(trip, idx) {
                return $('<li/>').append(getLineCodeElement(trip),
                                         getTimeElements(trip, idx < 2),
                                         getPlatformElement(trip));
            });
            if (!listItems.length) {
                const modeDesc = Entur.transportationModes()[mode];
                $('ul.departureList', el)
                    .replaceWith($('<ul/>', { 'class': 'departureList' }).append(
                        $('<li/>').text('Fant ingen avganger med '
                                        + modeDesc[0]
                                        + ' fra ' + data.placeFromName
                                        + ' til ' + data.placeToName)
                    ));
            } else {
                $('ul.departureList', el)
                    .replaceWith($('<ul/>', {class: 'departureList'}).append(listItems));
            }
        }).catch(function(e) {
            $('ul.departureList', el)
                .replaceWith(
                    $('<ul/>', {class: 'departureList'})
                        .append($('<li/>')
                                .text('Feilet for avgang'
                                      + ' fra ' + data.placeFromName + '[' + data.placeFrom + ']'
                                      + ' til ' + data.placeToName + '[' + data.placeTo + ']'
                                      + ': ' + e)));
        }).then(function() {
            el.data('loading', false);
        });
}


var updateTimeout = null;
function updateDepartures() {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }
    spinOnce($('#logospinner'));

    $('main section.departure').each(function(idx, el) {
        updateDeparture(el);
    });

    $('#last-updated-info').text(new Date().hhmm());

    updateTimeout = setTimeout(updateDepartures, 60000);
}

function listDepartures() {
    const appContent = $('main').empty();
    Storage.getDepartures().forEach(function (d) {
        $('<section/>', {id: 'departure-' + d.id, class: 'departure'})
            .data('id', d.id)
            .data('title', d.title)
            .data('placeFromId', d.placeFrom.stopId)
            .data('placeFromName', d.placeFrom.name)
            .data('placeToId', d.placeTo.stopId)
            .data('placeToName', d.placeTo.name)
            .data('mode', d.mode)
            .append($('<h2/>', {class:'departureHeading'}).text(d.title))
            .append(DropdownMenu.newDropdownMenu('Meny for avgang', {
                '&#x2b;/&#x2212;': function(ev) {
                    const el = $('#departure-' + d.id);
                    if (!el.data('numTrips') || el.data('numTrips') === 3) {
                        updateDeparture(el.data('numTrips', 6));
                    } else {
                        updateDeparture(el.data('numTrips', 3));
                    }
                },
                'Topp': function(ev) {
                    Storage.moveFirst(d.id);
                    $('#departure-' + d.id).detach().prependTo($('main'));
                },
                'Bunn': function(ev) {
                    Storage.moveLast(d.id);
                    $('#departure-' + d.id).detach().insertBefore($('#newDepartureButtons'));
                },
                'Slett': function(ev) {
                    ev.preventDefault();
                    Storage.removeDeparture(d.id);
                    $('#departure-' + d.id).remove();
                    if (!$('section.departure').length) {
                        $('#noDepartures').show();
                    }
                }
            }))
            .append($('<ul/>', {class:'departureList'}))
            .appendTo(appContent);
    });

    $('<section/>', {id:'noDepartures'}).append(
        $('<p>Ingen ruter er lagret.</p><p>Legg til nye ved å trykke på knappene under.</p>')
    ).appendTo(appContent);

    if (!$('section.departure').length) {
        $('#noDepartures').show();
    }

    const addCallback = function (newDep) {
        Storage.addDeparture({
            placeFrom: {
                stopId: newDep.placeFrom.stopId,
                name: newDep.placeFrom.name
            },
            placeTo: {
                stopId: newDep.placeTo.stopId,
                name: newDep.placeTo.name
            },
            title: newDep.title,
            mode: newDep.mode
        });
        listDepartures();
        updateDepartures();
    };

    DepartureInput.getNewDepartureButtons(addCallback).appendTo(appContent);
}

// Boot strap: load deps, setup events and trigger initial rendering of departures
(function loadJQuery(onJQueryLoaded) {

    const head = document.getElementsByTagName('head')[0];
    const baseUrl = document.currentScript.src.replace(/[^\/]*$/, '');

    const script = document.createElement('script');
    script.src = baseUrl + 'jquery-3.4.1.min.js';
    script.onload = function(ev) {
        const script = document.createElement('script');
        script.src = baseUrl + 'jquery.autocomplete.min.js';
        script.onload = onJQueryLoaded;
        head.appendChild(script);
    };
    head.appendChild(script);

})(function() {
    $(document).ready(function() {
        listDepartures();
        updateDepartures();
        $('header').click(updateDepartures);
        $(window).focus(updateDepartures);
    });
});
