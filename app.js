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
   - El: tiny DOM element library (replaces jQuery)
   - $: jQuery (deprecated, to be removed)
   - Entur: the 'Entur' singleton object with Entur API methods.
   - Storage: the 'Storage' singleton object of Storage API.
   - Bootstrap: the 'Bootstrap' singleton object from bootstrap.js.
*/

const defaultFadeTimeoutMilliseconds = 300;

/* Entur Geocoder autocomplete using jQuery autocomplete plugin. */
const GeocoderAutocomplete = function(inputElement, transportMode, Entur, onSelect, onInvalidate) {

    const autocomplete = $(inputElement).autocomplete({
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
            setTimeout(() => ViewportUtils.ensureLowerVisibility(element), delay);
            return;
        }

        const viewportLower = window.visualViewport.height + window.visualViewport.pageTop;
        const elementLower = element.getBoundingClientRect().bottom;
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
 * @returns an El-wrapped heading element for the departure.
 */
function elDepartureHeading(departure) {
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

    return El('h2.departureHeading').text(title);
}

/* Departure input form support. */
const DepartureInput = new (function() {

    const self = this;

    const elNewDepartureForm = function(transportMode, addCallback) {
        const modeDesc = Entur.transportModes[transportMode];

        const placeFromInputLabel = El('label', {for: 'placeFromInput'}).text('Fra ' + modeDesc.place());
        const placeFromInvalid = El('span.invalid#placeFromInvalid').text('Ikke funnet.');
        const placeFromInput = El('input#placeFromInput', {
            type: 'text',
            title: `Fra ${modeDesc.place()}`,
            placeholder: `Fra ${modeDesc.place()}`
        }).event('focus', (ev) => {
            ViewportUtils.ensureLowerVisibility(El.byId('departureSubmit').unwrap(), 500);
        });

        const placeToInputLabel = El('label', {for: 'placeToInput'}).text('Til ' + modeDesc.place());
        const placeToInvalid = El('span.invalid#placeToInvalid').text('Ikke funnet.');
        const placeToInput = El('input#placeToInput', {
            type: 'text',
            title: 'Til ' + modeDesc.place(),
            placeholder: 'Til ' + modeDesc.place()
        }).event('focus', (ev) => {
            ViewportUtils.ensureLowerVisibility(El.byId('departureSubmit').unwrap(), 500);
        });

        // New departure dynamic heading
        const updateHeading = function() {
            const headingEl = elDepartureHeading({
                placeFrom: {
                    name: placeFromInput.data('stopPlace')
                },
                placeTo: {
                    name: placeToInput.data('stopPlace')
                },
                mode: transportMode
            }).attr('id', 'newDepartureHeading');
            
            El.byId('newDepartureHeading').replaceWith(headingEl);
        };

        // Input validation
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

            // TODO validate that from/to is not the same stop place
            
            return ok;
        };
        
        const fromAutocomplete = new GeocoderAutocomplete(
            placeFromInput.unwrap(), transportMode, Entur, function(s) {
                // 'this' is bound to element on which event occurs
                let valueIsChanged = (s.value !== this.dataset['stopPlace']);
                
                this.dataset['stopPlaceId'] = s.data;
                this.dataset['stopPlace'] = s.value;
                updateHeading();

                if (placeFromInput.val() && valueIsChanged) {
                    placeToInput.focus();
                }
            }, function(e) {
                delete this.dataset['stopPlaceId'];
                delete this.dataset['stopPlace'];
            });
        
        const toAutocomplete = new GeocoderAutocomplete(
            placeToInput.unwrap(), transportMode, Entur, function(s) {
                // 'this' is bound to element on which event occurs
                let valueIsChanged = (s.value !== this.dataset['stopPlace']);
                
                this.dataset['stopPlaceId'] = s.data;
                this.dataset['stopPlace'] = s.value;
                updateHeading();

                if (placeToInput.val() && valueIsChanged) {
                    El.byId('departureSubmit').focus();
                }
            }, function() {
                delete this.dataset['stopPlaceId'];
                delete this.dataset['stopPlace'];
            });


        return El('form.newDeparture#newDepartureForm', {autocomplete: 'off'})
            .append(
                elDepartureHeading({
                    placeFrom: {},
                    placeTo: {},
                    mode: transportMode
                }).attr('id', 'newDepartureHeading'),

                El('ul.departureList').append(
                    El('li').append(placeFromInput, placeFromInputLabel, placeFromInvalid),
                    El('li').append(placeToInput, placeToInputLabel, placeToInvalid)
                ),

                El('button#departureSubmit', {type: 'submit'}).text('Legg til').click(validateInputs),

                El('button', {type: 'button'}).text('Avbryt').click((ev) => {
                    ev.preventDefault();
                    fromAutocomplete.dispose();
                    toAutocomplete.dispose();
                    El.byId('newDepartureForm')
                        .replaceWith(self.elNewDepartureButtons(addCallback));
                })
            ).event('submit', (ev) => {
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

    this.elNewDepartureButtons = function(addCallback) {
        return El('section#newDepartureButtons')
            .append(
                Object.entries(Entur.transportModes).map(([modeKey, mode]) => {
                    const buttonText = '+' + mode.name(true);
                    return El('button.newDeparture').text(buttonText)
                        .click(function(ev) {
                            ev.preventDefault();
                            El.byId('newDepartureButtons').replaceWith(
                                elNewDepartureForm(modeKey, addCallback));
                            El.byId('placeFromInput').focus();
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
        }

        globalCloseDropdownsHandlerRegistered = true;

        window.addEventListener('click', (ev) => {
            El.each('div.Dropdown__menu', (el) => el.fadeOut());
        });
    };

    var idSequence = 0;

    /* Create a new dropdown menu with a button and custom actions. */
    this.elDropdownMenu = function(title, actions) {
        registerGlobalCloseDropdownsHandler();

        const nextId = ++idSequence;

        const menuId = 'Dropdown__menu-' + nextId;

        return El('div.Dropdown__container#Dropdown__container-' + nextId)
            .append(
                El('button.Dropdown__button#Dropdown__button-' + nextId, { title })
                    .append(
                        El('img', {
                            src: 'menu.svg?_V=' + Bootstrap.V,
                            width: '16', height: '16',
                            alt: 'Meny-symbol'
                        }))
                    .click((ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        El.each('.Dropdown__menu', (el) => {
                            if (el.id() === menuId) {
                                if (el.isVisible()) {
                                    el.fadeOut();
                                } else {
                                    el.fadeIn('block').then((el) => {
                                        ViewportUtils.ensureLowerVisibility(el.unwrap());
                                    });
                                }
                            } else {
                                el.fadeOut();
                            }
                        });
                    }),

                El('div.Dropdown__menu.Dropdown__menuborder#' + menuId)
                    .append(
                        Object.entries(actions).map(([htmlLabel, handler]) => 
                            El('button.Dropdown__item')
                                .html(htmlLabel)
                                .click((ev) => {
                                    El.byId(menuId).fadeOut()
                                        .then((el) => handler.call(ev.target, ev));
                                })
                        )
                    )
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

function elPlatformElement(trip) {
    return (trip.legs[0].fromEstimatedCall.quay &&
            trip.legs[0].fromEstimatedCall.quay.publicCode) ?
        El('span.platformCode', {
            'title': 'Plattform ' + trip.legs[0].fromEstimatedCall.quay.publicCode
        }).html(trip.legs[0].fromEstimatedCall.quay.publicCode)
        :
        El('span');
}

function elLineCodeElement(trip) {
    const name = trip.legs[0].fromEstimatedCall.destinationDisplay.frontText;
    const publicCode = trip.legs[0].line.publicCode;
    const bgcolor = trip.legs[0].line.presentation.colour || '888';
    const fgcolor = trip.legs[0].line.presentation.textColour || 'FFF';

    return El('span.lineCode', {
        title: name,
        style: `color: #${fgcolor}; background-color: #${bgcolor};`
    }).html(publicCode);
}

function elSituationSymbolElement(trip) {
    if (trip.legs[0].situations && trip.legs[0].situations.length) {
        return El('span').html('&#x26a0;&#xfe0f;');
    }
    return null;
}

function elTimeElements(trip, displayMinutesToStart) {
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

    return El('span.startTime').html(
        (minutesDelayed > 0 ?
         `<strike>${aimedTime.hhmm()}</strike><span class="startTimeDelayed">${startTime.hhmm()}</span>` : startTime.hhmm())
            + (displayMinutesToStart ? ` (${minutesToStart})` : ''));
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
 * Render a situation list item for a situation object as returned by
 * {@link collectSituations}.
 */
function elSituationListItem(situation) {
    return El('li.situation').html('&#x26a0;&#xfe0f; ' + situation.summary + ' ')
        .append(El('a', {href: '#'})
                .click(ev => {
                    ev.preventDefault();
                    El('li.situation__expanded')
                        .html('&#x26a0;&#xfe0f; ' + situation.description)
                        .replace(ev.target.parentElement);
                }));
}

function elDepartureSection(d) {
    return El('section.departure#departure-' + d.id)
        .data('id', d.id)
        .data('placeFromId', d.placeFrom.stopId)
        .data('placeFromName', d.placeFrom.name)
        .data('placeToId', d.placeTo.stopId)
        .data('placeToName', d.placeTo.name)
        .data('mode', d.mode)
        .data('numTrips', d.numTrips || 3)
        .append(
            elDepartureHeading(d),
            
            DropdownMenu.elDropdownMenu('Meny for avgang', {
                'Snu': function(ev) {
                    const reversed = reverseDepartureInStorage(d.id);
                    El.byId('departure-' + d.id).replaceWith(elDepartureSection(reversed));
                    updateDeparture(El.byId('departure-' + d.id).unwrap());
                },
                '&#x2b; / &#x2212;': function(ev) {
                    showMoreOrLess(El.byId('departure-' + d.id));
                },
                'Topp': function(ev) {
                    const departureEl = El.byId('departure-' + d.id);
                    if (departureEl.unwrap().previousElementSibling === El.byId('noDepartures').unwrap()) {
                        return;
                    }
                    
                    departureEl.fadeOut(defaultFadeTimeoutMilliseconds).then((el) => {
                        Storage.moveFirst(d.id);
                        ViewportUtils.scrollToTop();
                        El.byId('noDepartures').unwrap()
                            .insertAdjacentElement('afterend', el.unwrap());
                        return el;
                    }).then((el) => el.fadeIn(null, defaultFadeTimeoutMilliseconds));
                },
                'Bunn': function(ev) {
                    const departureEl = El.byId('departure-' + d.id);
                    if (departureEl.unwrap().nextElementSibling === El.byId('newDepartureButtons').unwrap()) {
                        return;
                    }
                    
                    departureEl.fadeOut(defaultFadeTimeoutMilliseconds).then((el) => {
                        Storage.moveLast(d.id);
                        el.unwrap().parentElement.insertBefore(
                            el.unwrap(), El.byId('newDepartureButtons').unwrap());
                        return el.fadeIn(null, defaultFadeTimeoutMilliseconds);
                    }).then((el) => ViewportUtils.ensureLowerVisibility(el.unwrap()));
                },
                'Slett': function(ev) {
                    ev.preventDefault();
                    Storage.removeDeparture(d.id);
                    El.byId('departure-' + d.id).fadeOut(defaultFadeTimeoutMilliseconds).then((el) => {
                        el.remove();
                        if (El.one('section.departure') === null) {
                            El.byId('noDepartures').show();
                        }
                    });
                }
            }),

            El('ul.departureList'),
            El('ul.situationList')
        );
}

function departureListLoaderAnimation(departureListElement) {
    const elementHeight = departureListElement.getBoundingClientRect().height;
    const loaderHeight = Math.max(32, elementHeight);
    El('ul.departureList', {style: `height: ${loaderHeight}px`}).append(
        El('li').append(
            El('img.loader', {src: 'logo.svg?_V=' + Bootstrap.V})))
        .replace(departureListElement);
}

function spinOnce(element) {
    El.wrap(element)
        .removeClass('spinonce')
        .event('animationend', function handler(ev) {
            ev.target.classList.remove('spinonce');
            ev.target.removeEventListener('animationend', handler);
        })
        .addClass('spinonce');
}

function showMoreOrLess(element) {
    const el = El.wrap(element);
    if (!el.data('numTrips') || el.data('numTrips') == 3) {
        updateDepartureEl(el.data('numTrips', 6));
    } else {
        updateDepartureEl(el.data('numTrips', 3));
    }
    
    // Persist state
    const d = Storage.getDeparture(parseInt(el.data('id')));
    d.numTrips = parseInt(el.data('numTrips'));
    Storage.saveDeparture(d);
}

function reverseDepartureInStorage(departureId) {
    const departure = Storage.getDeparture(departureId);
    const tmp = departure.placeTo;
    departure.placeTo = departure.placeFrom;
    departure.placeFrom = tmp;
    return Storage.saveDeparture(departure);
}

function updateDepartureEl(departureSectionEl) {
    const el = departureSectionEl;

    if (el.data('loading') === 'true') {
        return;
    } else {
        el.data('loading', 'true');
    }

    departureListLoaderAnimation(El.one('ul.departureList', el).unwrap());

    const numTrips = el.data('numTrips') ? parseInt(el.data('numTrips')) : 3;
    const mode = el.data('mode');
    const placeFrom = el.data('placeFromId');
    const placeFromName = el.data('placeFromName');
    const placeTo = el.data('placeToId');
    const placeToName = el.data('placeToName');
    
    Entur.fetchJourneyPlannerResults(Entur.makeTripQuery(placeFrom, placeTo, mode, numTrips))
        .then((result) => {
            //throw new Error('Some mapping error occured');
            
            const listItems = result.data.trip.tripPatterns.map((trip, idx) =>
                El('li').append(
                    elLineCodeElement(trip),
                    elTimeElements(trip, idx < 2),
                    elPlatformElement(trip),
                    elSituationSymbolElement(trip)
                ));

            if (listItems.length) {
                const situationListItems =
                      collectSituations(result.data.trip.tripPatterns).map(elSituationListItem);
                El('ul.departureList').append(listItems).replace(El.one('ul.departureList', el));
                El('ul.situationList').append(situationListItems).replace(El.one('ul.situationList', el));
            } else {
                const modeDesc = Entur.transportModes[mode];
                El.one('ul.departureList', el).replaceWith(
                    El('ul.departureList').append(
                        El('li').text(
                            `Fant ingen avganger
                             med ${modeDesc.name()} fra ${placeFromName} til ${placeToName}`
                        )
                    )
                );
                
                El.if('ul.situationList', situationListEl => situationListEl.remove(), el);
            }
        })
        .catch((e) => {
            El('ul.departureList').append(
                El('li').html('Signalfeil ! Noe teknisk gikk galt &#x26a0;&#xfe0f;'),
                El('li').append(
                    El('button').text('Forsøk på nytt').click(ev => updateDepartures(true))
                ),
                El('li.technical').html(
                    `Feil: [${placeFrom}] &#x2192; [${placeTo}]: ${e.message}`
                )
            ).replace(El.one('ul.departureList', el));

            El.if('ul.situationList', situationListEl => situationListEl.remove(), el);
        })
        .finally(() => {
            el.data('loading', 'false');
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
        spinOnce(El.byId('logospinner').unwrap());

        El.each('main section.departure', updateDepartureEl);

        lastUpdate = new Date();
        El.byId('last-updated-info').text(lastUpdate.hhmm());

        if (appUpdateAvailable) {
            El.byId('appUpdate').show();
        }
    }

    updateTimeout = setTimeout(updateDepartures, 60000);
}

function renderApp() {
    const departures = Storage.getDepartures();

    const appContent = El('main');

    El('section#appUpdate').append(El('p').html(
        '<p>En ny app-versjon er tilgjengelig, <a href="javascript:window.location.reload()">klikk her for å oppdatere</a>.</p>'
    )).appendTo(appContent);

    El('section#noDepartures').append(El('p').html(
        '<p>En ny app-versjon er tilgjengelig, <a href="javascript:window.location.reload()">klikk her for å oppdatere</a>.</p>'
    )).appendTo(appContent);

    if (departures.length === 0) {
        El.byId('noDepartures').show();
    }

    departures.forEach((departure) => elDepartureSection(departure).appendTo(appContent));

    const addCallback = (newDep) => {
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

    DepartureInput.elNewDepartureButtons(addCallback).appendTo(appContent);

    El.one('main').replaceWith(appContent);
}


/* Application entry point, called after script dependencies have been loaded. */
function appInit() {
    renderApp();

    updateDepartures();

    El.one('header').click(() => updateDepartures(true));

    new WindowSwipeDownFromTopHandler(() => updateDepartures(true));

    El.wrap(window).event('focus', () => setTimeout(updateDepartures, 500));

    Bootstrap.appUpdateAvailable.then(() => { appUpdateAvailable = true; });
}

/* Local Variables: */
/* js2-additional-externs: ("$" "jQuery" "El" "Storage" "Entur" "Bootstrap") */
/* End: */
