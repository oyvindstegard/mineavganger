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
 *   https://github.com/devbridge/jQuery-Autocomplete
 **********************************************************************************
 */

'use strict';

/* Expected globals:
   - Entur: instance of Entur API functions
   - Storage: instance of Storage API
   - Bootstrap: Bootstrap object from bootstrap.js
*/

const animDuration = 100; // general duration of any animated effect in UI, in ms

/* Entur Geocoder autocomplete using jQuery autocomplete plugin. */
const GeocoderAutocomplete = function(inputElement, transportMode, Entur, onSelect, onInvalidate) {

    const autocomplete = inputElement.autocomplete({
        serviceUrl: Entur.getGeocoderAutocompleteApiUrl(),
        paramName: Entur.getGeocoderAutocompleteApiQueryParamName(),
        params: Entur.getGeocoderAutocompleteApiParams(transportMode),
        ajaxSettings: {
            dataType: 'json',
            headers: Entur.getGeocoderAutocompleteApiHeaders()
        },
        onSelect: onSelect,
        onInvalidateSelection: onInvalidate,
        minChars: 2,
        transformResult: function(response, originalQuery) {
            const suggestions = response.features.map(function(feature) {
                return {
                    'value': feature.properties.label,
                    'data': feature.properties.id
                };
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
        if (delay) {
            setTimeout(function() {
                ViewportUtils.ensureLowerVisibility(element);
            }, delay);
            return;
        }
        
        const viewportLower = $(window).scrollTop() + $(window).height();
        const elementLower = $(element).offset().top + $(element).outerHeight();
        const pixelsBelow = elementLower - viewportLower;
        if (pixelsBelow > -10) {
            window.scrollBy(0, pixelsBelow + 10);
        }
    },
    
    scrollToTop: function() {
        window.scroll(0,0);
    }
};

/**
 * Attaches touch event handlers to window and invokes
 * provided callback if a touch swipe down is detected.
 * The callback is not provided with any arguments and 'this' is
 * bound to the window.
 */
const WindowSwipeDownFromTopHandler = function(callback) {
    let startY;

    const touchStartHandler = function(ev) {
        startY = ev.changedTouches[0].pageY;
    };

    const touchEndHandler = function(ev) { 
        let endY = ev.changedTouches[0].pageY;

        if (startY !== -1 && (endY - startY) >= 150) {
            callback();
        }
    };

    window.addEventListener('touchstart', touchStartHandler);
    window.addEventListener('touchend', touchEndHandler);

    this.dispose = function() {
        window.removeEventListener('touchstart', touchStartHandler);
        window.removeEventListener('touchend', touchEndHandler);
    };
};


/**
 * @returns a jQuery-wrapped heading element for the departure
 */
function getDepartureHeading(departure) {
    let title = '';
    if (departure.placeFrom && departure.placeFrom.name) {
        title = 'fra ' + departure.placeFrom.name.replace(/,.*$/,'');
    }
    if (departure.placeTo && departure.placeTo.name) {
        if (!title) {
            title = '...';
        }
        title += ' til ' + departure.placeTo.name.replace(/,.*$/,'');
    }
    if (!title) {
        title = 'Ny avgang med ' +  Entur.transportModes[departure.mode].name();
    } else {
        title = Entur.transportModes[departure.mode].name(true) + ' ' + title;
    }
    
    return $('<h2/>', { class: 'departureHeading' }).text(title);
}

/* Departure input form support. */
const DepartureInput = new (function() {

    const self = this;

    const getNewDepartureForm = function(transportMode, addCallback) {
        const modeDesc = Entur.transportModes[transportMode];

        // Stop place from
        const placeFromInputLabel = $('<label/>', { for: 'placeFromInput' })
                  .text('Fra ' + modeDesc.place());
        const placeFromInvalid = $('<span/>', {id:'placeFromInvalid', class:'invalid'})
                  .text('Ikke funnet.').hide();
        const placeFromInput = $('<input/>', {
            id: 'placeFromInput',
            type: 'text',
            title: 'Fra ' + modeDesc.place(),
            placeholder: 'Fra ' + modeDesc.place()
        }).focus(function (ev) {
            ViewportUtils.ensureLowerVisibility($('#departureSubmit'), 500);
        });

        // Stop place to
        const placeToInputLabel = $('<label/>', { for: 'placeToInput' })
                  .text('Til ' + modeDesc.place());
        const placeToInvalid = $('<span/>', {id:'placeToInvalid', class:'invalid'})
                  .text('Ikke funnet.').hide();
        const placeToInput = $('<input/>', {
            id: 'placeToInput',
            type: 'text',
            title: 'Til ' + modeDesc.place(),
            placeholder: 'Til ' + modeDesc.place()
        }).focus(function (ev) {
            ViewportUtils.ensureLowerVisibility($('#departureSubmit'), 500);
        });

        const updateHeading = function() {
            const heading = getDepartureHeading({
                placeFrom: {
                    name: placeFromInput.data('stopPlace')
                },
                placeTo: {
                    name: placeToInput.data('stopPlace')
                },
                mode: transportMode
            }).attr('id', 'newDepartureHeading');
            $('#newDepartureHeading').replaceWith(heading);
        };

        const validateInputs = function(ev) {
            let ok = true;

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
            // 'this' is bound to element on which event occurs
            let valueIsChanged = (s.value !== $(this).data('stopPlace'));
            
            $(this).data('stopPlaceId', s.data).data('stopPlace', s.value);
            updateHeading();

            if (placeFromInput.val() && valueIsChanged) {
                placeToInput.focus();
            }
        }, function(e) {
            $(this).data('stopPlaceId', null).data('stopPlace', null);
        });
        const toAutocomplete = new GeocoderAutocomplete(placeToInput, transportMode, Entur, function(s) {
            // 'this' is bound to element on which event occurs
            let valueIsChanged = (s.value !== $(this).data('stopPlace'));
            
            $(this).data('stopPlaceId', s.data).data('stopPlace', s.value);
            updateHeading();

            if (placeToInput.val() && valueIsChanged) {
                $('#departureSubmit').focus();
            }
        }, function() {
            $(this).data('stopPlaceId', null).data('stopPlace', null);
        });
        
        return $('<form/>', { 'id': 'newDepartureForm',
                              'class': 'newDeparture',
                              'autocomplete': 'off' }) // Disable native "history" auto-completion
            .append(getDepartureHeading({
                placeFrom: {},
                placeTo: {},
                mode: transportMode
            }).attr('id', 'newDepartureHeading'))
            .append($('<ul/>',{ class:'departureList' })
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
                    mode: transportMode
                });
                return true;
            });
    };
    
    this.getNewDepartureButtons = function(addCallback) {
        return $('<section/>', {id: 'newDepartureButtons'}).append(
            $.map(Entur.transportModes,
                  function (modeDesc, transportMode) {
                      const buttonText = '+' + modeDesc.name(true);
                      return $('<button/>', {class:'newDeparture'}).text(buttonText)
                          .click(function(e) {
                              e.preventDefault();
                              $('#newDepartureButtons').replaceWith(
                                  getNewDepartureForm(transportMode, addCallback));
                              $('#placeFromInput').focus();
                          });
                  }));
    };
    
})();

/* Dropdown menus support. */
const DropdownMenu = new (function() {

    var globalCloseDropdownsHandlerRegistered = false;
    const registerGlobalCloseDropdownsHandler = function () {
        if (globalCloseDropdownsHandlerRegistered) {
            return;
        } else {
            globalCloseDropdownsHandlerRegistered = true;
        }
        $(window).click(function (ev) {
            $('div.Dropdown__menu').each(function (idx, e) { $(e).fadeOut(animDuration); });
        });
    };

    var idSequence = 0;

    /* Create a new dropdown menu with a button and custom actions. */
    this.newDropdownMenu = function(title, actions) {
        registerGlobalCloseDropdownsHandler();

        const nextId = ++idSequence;

        return $('<div/>', { class: 'Dropdown__container',
                            id: 'Dropdown__container-' + nextId })
            .append($('<button/>', { class: 'Dropdown__button',
                                     id: 'Dropdown__button-' + nextId,
                                     title: title })
                    .append($('<img/>', { src: 'menu.svg?_V=' + Bootstrap.V,
                                          width: '16',
                                          height: '16',
                                          alt: 'Meny-symbol' }))
                    .click(function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        const thisMenuId = 'Dropdown__menu-' + nextId;
                        $('.Dropdown__menu').each(function(idx, e) {
                            if (e.id === thisMenuId) {
                                if ($(e).is(':visible')) {
                                    $(e).fadeOut(animDuration);
                                } else {
                                    $(e).fadeIn(animDuration, function() {
                                        ViewportUtils.ensureLowerVisibility(e);
                                    });
                                }
                            } else {
                                $(e).fadeOut(animDuration);
                            }
                        });
                    })
                   )
            .append($('<div/>', {class: 'Dropdown__menu Dropdown__menuborder',
                                 id: 'Dropdown__menu-' + nextId}
                     ).append($.map(actions, function(val, key) {
                         return $('<button/>', { class: 'Dropdown__item' })
                             .html(key)
                             .click(function(e) {
                                 let element = this;
                                 $('#Dropdown__menu-' + nextId).fadeOut(animDuration, function() {
                                     val.call(element, e);
                                 });
                             });
                    }))
                   );
    };
})();

// Date extensions
// Compat with Safari/IOS
Date.parseIsoCompatible = function(iso8601) {
    return new Date(iso8601.replace(/\+([0-9]{2})([0-9]{2})$/, "+$1:$2"));
};
Date.prototype.diffMinutes = function(laterDate) {
    return Math.floor((laterDate - this) / 1000 / 60);
};
Date.prototype.hhmm = function() {
    var mins = this.getMinutes() < 10 ? '0' + this.getMinutes() : this.getMinutes();
    var hours = this.getHours() < 10 ? '0' + this.getHours() : this.getHours();
    return hours + ':' + mins;
};

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
function getSituationSymbolElement(trip) {
    if (trip.legs[0].situations && trip.legs[0].situations.length) {
        return $('<span/>', {
            'html': '&#x26a0;&#xfe0f;'
        });
    }
}
function getTimeElements(trip, displayMinutesToStart) {
    const now = new Date();
    const startTime = Date.parseIsoCompatible(trip.legs[0].fromEstimatedCall.expectedDepartureTime);
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

/**
 * Collect and transform list of unique situation objects from a set of trip patterns.
 * Each object in returned list has shape:
 *  {
 *    "summary": ""<Summary of situation in Norwegian>"",
 *    "description": "<Description of situation in Norwegian>",
 *    "validityPeriod": {
 *      "startTime": "<timestamp>",
 *      "endTime": "<timestamp>"
 *    }
 *  }
 *  @returns {Array} list of unique situation objects
 */
function collectSituations(tripPatterns) {
    const situations = [];
    
    tripPatterns.forEach(function(tripPattern) {
        tripPattern.legs.forEach(function(leg) {
            leg.situations.forEach(function(situation) {
                const description = situation.description.find(function(description) {
                    return description.language === 'no';
                });
                const summary = situation.summary.find(function(summary) {
                    return summary.language === 'no';
                });
                if (summary && description) {
                    if (situations.find(function(s) {
                        return s.summary === summary.value &&
                            s.description === description.value;
                    })) {
                        return;
                    }
                    
                    situations.push({
                        summary: summary.value,
                        description: description.value,
                        validityPeriod: situation.validityPeriod
                    });
                }
            });
        });
    });

    return situations;
}

/**
 * Generate a list of situation items from list of situation objects as returned by
 * {@link collectSituations}.
 */
function getSituationListItem(situation) {
    return $('<li/>', { class: 'situation' })
        .html('&#x26a0;&#xfe0f; ' + situation.summary + ' ')
        .append($('<a/>', {href:'#'})
                .text('Vis mer')
                .click(function(ev) {
                    ev.preventDefault();
                    $(this).parent().replaceWith(
                        $('<li/>', { class: 'situation__expanded' })
                            .html('&#x26a0;&#xfe0f; ' + situation.description)
                        
                    );
                })
               );
}

function getDepartureSection(d) {
    return $('<section/>', {id: 'departure-' + d.id, class: 'departure'})
        .data('id', d.id)
        .data('placeFromId', d.placeFrom.stopId)
        .data('placeFromName', d.placeFrom.name)
        .data('placeToId', d.placeTo.stopId)
        .data('placeToName', d.placeTo.name)
        .data('mode', d.mode)
        .data('numTrips', d.numTrips || 3)
        .append(getDepartureHeading(d))
        .append(DropdownMenu.newDropdownMenu('Meny for avgang', {
            'Snu': function(ev) {
                const reversed = reverseDepartureInStorage(d.id);
                $('#departure-' + d.id).replaceWith(getDepartureSection(reversed));
                updateDeparture($('#departure-' + d.id));
            },
            '&#x2b; / &#x2212;': function(ev) {
                showMoreOrLess($('#departure-' + d.id));
            },
            'Topp': function(ev) {
                Storage.moveFirst(d.id);
                $('#departure-' + d.id).detach().insertAfter($('#noDepartures'));
                ViewportUtils.scrollToTop();
            },
            'Bunn': function(ev) {
                Storage.moveLast(d.id);
                const element = $('#departure-' + d.id)
                                 .detach()
                                 .insertBefore($('#newDepartureButtons'))[0];
                ViewportUtils.ensureLowerVisibility(element);
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
        .append($('<ul/>', {class:'departureList'}),
                $('<ul/>', {class:'situationList'}));
}

function showDepartureLoader(el) {
    const contentHeight = Math.max(32, $(el).height()) + 'px';
    const loaderEl = $('<ul/>', {class:'departureList', height:contentHeight}).append(
        $('<li/>').append($('<img/>', { src: 'logo.svg?_V=' + Bootstrap.V, class:'loader' })));
    $(el).replaceWith(loaderEl);
}

function spinOnce(el) {
    $(el).replaceWith($(el).clone().addClass('spinonce'));
}

// Expects a departure section element as argument
function showMoreOrLess(el) {
    if (! (el instanceof jQuery)) {
        el = $(el);
    }
    if (!el.data('numTrips') || el.data('numTrips') === 3) {
        updateDeparture(el.data('numTrips', 6));
    } else {
        updateDeparture(el.data('numTrips', 3));
    }
    // Persist state
    const d = Storage.getDeparture(el.data('id'));
    d.numTrips = el.data('numTrips');
    Storage.saveDeparture(d);
}

function reverseDepartureInStorage(departureId) {
    const departure = Storage.getDeparture(departureId);
    const tmp = departure.placeTo;
    departure.placeTo = departure.placeFrom;
    departure.placeFrom = tmp;
    return Storage.saveDeparture(departure);
}

function updateDeparture(el) {
    if (! (el instanceof jQuery)) {
        el = $(el);
    }
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
                                         getPlatformElement(trip),
                                         getSituationSymbolElement(trip));
            });
            
            if (!listItems.length) {
                const modeDesc = Entur.transportModes[mode];
                $('ul.departureList', el)
                    .replaceWith($('<ul/>', { 'class': 'departureList' }).append(
                        $('<li/>').text('Fant ingen avganger med '
                                        + modeDesc.name()
                                        + ' fra ' + data.placeFromName
                                        + ' til ' + data.placeToName)
                    ));
                $('ul.situationList', el).remove();
            } else {
                const situationListItems =
                      collectSituations(result.data.trip.tripPatterns).map(getSituationListItem);

                $('ul.departureList', el).replaceWith($('<ul/>', {class: 'departureList'}).append(listItems));
                $('ul.situationList', el).replaceWith($('<ul/>', {class: 'situationList'}).append(situationListItems));
            }
        }).catch(function(e) {
            $('ul.departureList', el).replaceWith(
                $('<ul/>', {class: 'departureList'})
                    .append($('<li/>').html('Signalfeil ! Noe teknisk gikk galt &#x26a0;&#xfe0f;'))
                    .append($('<li/>').html('<button>Forsøk på nytt</button>')
                            .click(function(ev) {
                                ev.preventDefault();
                                updateDepartures(true);
                            }))
                    .append($('<li/>', {
                        class:'technical',
                        html: 'Feil: [' + data.placeFromId + '] &#x2192; [' +
                            data.placeToId + ']: ' + e.statusText
                    })));
            $('ul.situationList', el).remove();
        }).then(function() {
            el.data('loading', false);
        });
}

var lastUpdate = null;
var updateTimeout = null;
var appUpdateAvailable = false;
function updateDepartures(userIntent) {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }

    if (userIntent === true || lastUpdate === null
        || (new Date().getTime() - lastUpdate.getTime()) >= 60000) {
        spinOnce($('#logospinner'));

        $('main section.departure').each(function(idx, el) {
            updateDeparture(el);
        });

        lastUpdate = new Date();
        $('#last-updated-info').text(lastUpdate.hhmm());

        if (appUpdateAvailable) {
            $('#appUpdate').show();
        }
    }

    updateTimeout = setTimeout(updateDepartures, 60000);
}

function renderApp() {
    const departures = Storage.getDepartures();
    
    const appContent = $('main').empty();

    $('<section/>', {id:'appUpdate'}).append(
        $('<p>En ny app-versjon er tilgjengelig, <a href="javascript:window.location.reload()">klikk her for å oppdatere</a>.</p>')
    ).appendTo(appContent);

    $('<section/>', {id:'noDepartures'}).append(
        $('<p>Ingen ruter er lagret.</p><p>Legg til nye ved å velge transporttype med knappene under.</p>')
    ).appendTo(appContent);
    if (departures.length === 0) {
        $('#noDepartures').show();
    }

    departures.forEach(function (departure) {
        getDepartureSection(departure).appendTo(appContent);
    });

    const addCallback = function (newDep) {
        Storage.saveDeparture({
            placeFrom: {
                stopId: newDep.placeFrom.stopId,
                name: newDep.placeFrom.name
            },
            placeTo: {
                stopId: newDep.placeTo.stopId,
                name: newDep.placeTo.name
            },
            mode: newDep.mode
        });
        renderApp();
        updateDepartures(true);
    };

    DepartureInput.getNewDepartureButtons(addCallback).appendTo(appContent);
}


/* Application entry point, called after dependencies have been loaded and DOM
 * is ready. */
function appInit() {
    renderApp();
    updateDepartures(); 
    $('header').click(function(ev) { updateDepartures(true); });
    new WindowSwipeDownFromTopHandler(function() { updateDepartures(true); });
    $(window).focus(function(ev) { setTimeout(updateDepartures, 500); });

    Bootstrap.appUpdateAvailable.then(function() {
        appUpdateAvailable = true;
    });
}

/* Local Variables: */
/* js2-additional-externs: ("$" "jQuery" "Storage" "Entur" "Bootstrap") */
/* End: */
