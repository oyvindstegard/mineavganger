/**********************************************************************************
 * JavaScript/HTML 5 web app for personalized display of departures using Entur
 * JourneyPlanner API. The code uses ES6 features, which limits browser support
 * to modern stuff.
 * 
 * Author: Øyvind Stegard <oyvind@stegard.net>
 * License: GPL-3
 **********************************************************************************
 */

'use strict';

/* Expected globals in browser runtime:
   - El: tiny DOM element library (replaces jQuery)
   - Entur: the 'Entur' singleton object with Entur API methods.
   - Storage: the 'Storage' singleton object of Storage API.
   - Bootstrap: the 'Bootstrap' singleton object from bootstrap.js.
*/

const defaultFadeTimeoutMilliseconds = 300;

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
        const placeFromInvalid = El('span.invalid#placeFromInvalid').text('Ikke funnet');
        const placeFromInput = El('input#placeFromInput', {
            type: 'text',
            title: `Fra ${modeDesc.place()}`,
            placeholder: `Fra ${modeDesc.place()}`
        }).event('focus', ev => El.byId('departureSubmit').scrollTo());

        const placeToInputLabel = El('label', {for: 'placeToInput'}).text('Til ' + modeDesc.place());
        const placeToInvalid = El('span.invalid#placeToInvalid').text('Ikke funnet');
        const placeToInput = El('input#placeToInput', {
            type: 'text',
            title: 'Til ' + modeDesc.place(),
            placeholder: 'Til ' + modeDesc.place()
        }).event('focus', ev => El.byId('departureSubmit').scrollTo());

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

        const updateFromInvalid = function(reason) {
            if (reason) {
                placeFromInvalid.css('visibility', 'visible').text(reason);
                placeFromInput.addClass('invalid');
                return;
            }

            placeFromInput.removeClass('invalid');
            placeFromInvalid.css('visibility', 'hidden');
        };

        const updateToInvalid = function(reason) {
            if (reason) {
                placeToInvalid.css('visibility', 'visible').text(reason);
                placeToInput.addClass('invalid');
                return;
            }

            placeToInput.removeClass('invalid');
            placeToInvalid.css('visibility', 'hidden');
        };

        const validateInputs = function(ev) {
            let ok = true;

            if (placeFromInput.val() !== placeFromInput.data('stopPlace')) {
                updateFromInvalid('Ikke funnet');
                ok = false;
            }

            if (placeToInput.val() !== placeToInput.data('stopPlace')) {
                updateToInvalid('Ikke funnet');
                ok = false;
            }

            if (ok && placeFromInput.data('stopPlaceId') === placeToInput.data('stopPlaceId')) {
                updateFromInvalid('Fra og til er samme stoppested.');
                updateToInvalid('Fra og til er samme stoppested.');
                ok = false;
            }

            if (ok) {
                updateFromInvalid();
                updateToInvalid();
            }

            return ok;
        };
        
        const fromAutocomplete = new GeoComplete(
            placeFromInput, transportMode,
            function onSelect(id, label) {
                // 'this' is bound to element on which event occurs
                let valueIsChanged = (id !== this.dataset['stopPlaceId']);
                
                this.dataset['stopPlaceId'] = id;
                this.dataset['stopPlace'] = label;
                updateHeading();
                updateFromInvalid();

                if (placeFromInput.val() && valueIsChanged) {
                    placeToInput.focus();
                }
            },
            function onInvalidate() {
                console.log('invalidated selected input');
                delete this.dataset['stopPlaceId'];
                delete this.dataset['stopPlace'];
            });
        
        const toAutocomplete = new GeoComplete(
            placeToInput.unwrap(), transportMode,
            function onSelect(id, label) {
                // 'this' is bound to element on which event occurs
                let valueIsChanged = (id.value !== this.dataset['stopPlaceId']);
                
                this.dataset['stopPlaceId'] = id;
                this.dataset['stopPlace'] = label;
                updateHeading();
                updateToInvalid();

                if (placeToInput.val() && valueIsChanged) {
                    El.byId('departureSubmit').focus();
                }
            }, function onInvalidate() {
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

                El('button#departureSubmit', {type: 'submit'}).text('Legg til'),

                El('button', {type: 'button'}).text('Avbryt').click(ev => {
                    ev.preventDefault();
                    fromAutocomplete.dispose();
                    toAutocomplete.dispose();
                    El.byId('newDepartureForm')
                        .replaceWith(self.elNewDepartureButtons(addCallback));
                })
            ).event('submit', ev => {
                if (!validateInputs()) {
                    ev.preventDefault();
                    return;
                }
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

/* Mutually exclusive multiple dropdown menus support. */
const DropdownMenu = new (function() {

    var globalCloseDropdownsHandlerRegistered = false;
    const registerGlobalCloseDropdownsHandler = function () {
        if (globalCloseDropdownsHandlerRegistered) {
            return;
        }

        globalCloseDropdownsHandlerRegistered = true;

        window.addEventListener('click', () => El.each('div.Dropdown__menu', el => el.fadeOut()));
    };

    var idSequence = 0;

    /* Create a new dropdown menu with a button and custom actions. */
    this.elDropdownMenu = function(title, actions) {
        registerGlobalCloseDropdownsHandler();

        const nextId = ++idSequence;

        const menuId = 'Dropdown__menu-' + nextId;

        const dropdownContainerId = 'Dropdown__container-' + nextId;

        return El('div.Dropdown__container#' + dropdownContainerId)
            .append(
                El('button.Dropdown__button#Dropdown__button-' + nextId, { title })
                    .append(
                        El('img', {
                            src: 'menu.svg?_V=' + Bootstrap.V,
                            width: '16', height: '16',
                            alt: 'Meny-symbol'
                        }))
                    .click(ev => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        
                        El.each('.Dropdown__menu', el => {
                            if (el.id() === menuId) {
                                if (el.isVisible()) {
                                    el.fadeOut();
                                } else {
                                    El.each('button.Dropdown__item', buttonEl => {
                                        const action = actions.find(
                                            a => a.label === buttonEl.data('label'));

                                        if (!action.hideIf) return;

                                        if (action.hideIf(buttonEl)) {
                                            buttonEl.hide();
                                        } else {
                                            buttonEl.show();
                                        }
                                    }, el);
                                    
                                    el.fadeIn('block').then(el => el.scrollTo());
                                }
                            } else {
                                el.fadeOut();
                            }
                        });
                    }),

                El('div.Dropdown__menu.Dropdown__menuborder#' + menuId)
                    .append(
                        actions.map(({label, handler}) => 
                                    El('button.Dropdown__item')
                                    .html(label)
                                    .data('label', label)
                                    .click(ev => {
                                        ev.preventDefault();
                                        ev.stopPropagation();
                                        El.byId(menuId).fadeOut()
                                            .then(el => handler.call(ev.target, ev));
                                    })
                                   ),
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
 *    "id":            "<opaque situation identifier string>",
 *    "n":             <n-th collected situation, starting from 1>,
 *    "summary":       "<Summary of situation in Norwegian>",
 *    "description":   "<Description of situation in Norwegian>"
 *    "appliesTo":     [Array of trip/leg-id strings]
 *  }
 *  @returns {Array} list of unique situation objects
 */
function collectSituations(tripPatterns) {
    const situations = [];
    let n = 1;
    
    tripPatterns.forEach(tripPattern => {
        tripPattern.legs.forEach(leg => {
            leg.situations.forEach(situation => {
                const alreadyCollected = situations.find(s => s.id === situation.id);
                if (alreadyCollected) {
                    alreadyCollected.appliesTo.push(leg.id);
                    return;
                }

                const description = situation.description.find(desc => desc.language === 'no');
                const summary = situation.summary.find(s => s.language === 'no');

                if (summary && description) {
                    situations.push({
                        id: situation.id,
                        n: n++,
                        summary: summary.value,
                        description: description.value,
                        appliesTo: [leg.id]
                    });
                }
            });
        });
    });

    return situations;
}

function elSituationSymbolElement(trip, collectedSituations, showSituationNumbers) {
    const leg = trip.legs[0];
    const appliesToTrip = collectedSituations.filter(s => s.appliesTo.indexOf(leg.id) > -1);
    if (appliesToTrip.length) {
        return El('span').html('&#x26a0;&#xfe0f;').append(
            showSituationNumbers ?
                El('span.situationNumber')
                .css('font-size', '90%')
                .html(' ' + appliesToTrip.map(s => s.n).join(', ')) : null);
    }
    return null;
}

/**
 * Render a situation list item for a situation object as returned by
 * {@link collectSituations}.
 */
function elSituationListItem(situation, showSituationNumber) {
    const situationNumberHtml = `${situation.n}.&nbsp;`;
    return El('li.situation').html((showSituationNumber ? situationNumberHtml : '')
                                   + '&#x26a0;&#xfe0f; ' + situation.summary + ' ')
        .append(El('a', {href: '#'})
                .text('Vis mer')
                .click(ev => {
                    ev.preventDefault();
                    postponeUpdate(20);
                    El('li.situation__expanded')
                        .html((showSituationNumber ? situationNumberHtml : '')
                              + ' &#x26a0;&#xfe0f; ' + situation.description)
                        .replace(ev.target.parentElement);
                }));
}

function elDepartureSection(d) {
    const departureId = 'departure-' + d.id;
    
    const menuActions = [
        {
            label: 'Snu',
            handler: function(ev) {
                const reversed = reverseDepartureInStorage(d.id);
                El.byId(departureId).replaceWith(elDepartureSection(reversed));
                updateDeparture(El.byId(departureId));
            }
        },
        {
            label: 'Færre',
            handler: function(ev) {
                setDepartureElementNumTrips(El.byId(departureId), 3);
            },
            hideIf: function(buttonEl) {
                const departureEl = El.byId(departureId);
                return departureEl.data('numTrips') === '3';
            }
        },
        {
            label: 'Flere',
            handler: function(ev) {
                setDepartureElementNumTrips(El.byId(departureId), 6);
            },
            hideIf: function(buttonEl) {
                const departureEl = El.byId(departureId);
                return departureEl.data('numTrips') === '6';
            }
        },
        {
            label: 'Topp',
            handler: function(ev) {
                const departureEl = El.byId(departureId);
                if (departureEl.prev().id() === 'noDepartures') {
                    return;
                }
                departureEl.fadeOut(defaultFadeTimeoutMilliseconds).then(el => {
                    Storage.moveFirst(d.id);
                    El.byId('noDepartures').unwrap()
                        .insertAdjacentElement('afterend', el.unwrap());
                    return el;
                }).then(el => {
                    window.scrollTo(0,0);
                    return el.fadeIn(null, defaultFadeTimeoutMilliseconds);
                });
            },
            hideIf: function(buttonEl) {
                const departureEl = El.byId(departureId);
                const atTop = departureEl.prev().id() === 'noDepartures';

                return atTop;
            }
        },
        {
            label: 'Bunn',
            handler: function(ev) {
                const departureEl = El.byId(departureId);
                const bottomEl = El.one('#newDepartureButtons, #newDepartureForm');
                departureEl.fadeOut(defaultFadeTimeoutMilliseconds).then(el => {
                    Storage.moveLast(d.id);
                    el.unwrap().parentElement.insertBefore(el.unwrap(), bottomEl.unwrap());
                    return el.fadeIn(null, defaultFadeTimeoutMilliseconds);
                });
            },
            hideIf: function(buttonEl) {
                const departureEl = El.wrap(buttonEl.unwrap().closest('.departure'));
                const atBottom = departureEl.next().id() === 'newDepartureButtons'
                          || departureEl.next().id() === 'newDepartureForm';

                return atBottom;
            }
        },
        {
            label: 'Slett',
            handler: function(ev) {
                Storage.removeDeparture(d.id);
                El.byId(departureId).fadeOut(defaultFadeTimeoutMilliseconds).then(el => {
                    el.remove();
                    if (El.none('section.departure')) {
                        El.byId('noDepartures').show();
                    }
                });
            }
        }
    ];

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
            DropdownMenu.elDropdownMenu('Meny for avgang', menuActions),
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
        .event('animationend', ev => ev.target.classList.remove('spinonce'), {once: true})
        .addClass('spinonce');
}

function setDepartureElementNumTrips(element, numTrips) {
    numTrips = numTrips ? numTrips : 3;
    const el = El.wrap(element);
    updateDeparture(el.data('numTrips', numTrips));
    
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

function updateDeparture(departureSection) {
    const el = El.wrap(departureSection);

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
        .then(result => {
            const situations = collectSituations(result.data.trip.tripPatterns);
            const showSituationNumbers = situations.length > 1;
            
            const listItems = result.data.trip.tripPatterns.map((trip, idx) =>
                El('li').append(
                    elLineCodeElement(trip),
                    elTimeElements(trip, idx < 2),
                    elPlatformElement(trip),
                    elSituationSymbolElement(trip, situations, showSituationNumbers)
                ));

            if (listItems.length) {
                const situationListItems = situations.map(s => elSituationListItem(s, showSituationNumbers));
                
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

const updateIntervalSeconds = 60;
var lastUpdate = null;
var updateTimeout = null;
var appUpdateAvailable = false;
function updateDepartures(userIntent) {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }

    if (userIntent === true || lastUpdate === null
        || (new Date().getTime() - lastUpdate.getTime()) >= updateIntervalSeconds*1000) {
        spinOnce(El.byId('logospinner').unwrap());

        El.each('main section.departure', updateDeparture);

        lastUpdate = new Date();
        El.byId('last-updated-info').text(lastUpdate.hhmm());

        if (appUpdateAvailable) {
            El.byId('appUpdate').show();
        }
        if (El.none('main section.departure')) {
            El.byId('noDepartures').show();
        }
    }

    updateTimeout = setTimeout(updateDepartures, updateIntervalSeconds*1000);
}

function postponeUpdate(secondsToPostpone) {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }

    const nowSeconds = new Date().getTime() / 1000;
    
    const nextRegularUpdateInSeconds =
              lastUpdate ? updateIntervalSeconds - (nowSeconds - lastUpdate.getTime()/1000) : 0;

    const postponedUpdateInSeconds = Math.max(nextRegularUpdateInSeconds, 0) + secondsToPostpone;

    const postponedTimeoutSeconds = Math.min(updateIntervalSeconds, postponedUpdateInSeconds);

    updateTimeout = setTimeout(updateDepartures, postponedTimeoutSeconds*1000);
}

function renderApp() {
    const departures = Storage.getDepartures();

    const appContent = El('main');

    El('section#appUpdate').html(
        '<p>En ny app-versjon er tilgjengelig, <a href="javascript:window.location.reload()">trykk for å oppdatere</a>.</p>'
    ).appendTo(appContent);

    El('section#noDepartures').html(
        '<p>Ingen avganger er lagret.</p><p>Legg til nye ved å velge transportmiddel med knappene under.</p>'
    ).appendTo(appContent);

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

    window.addEventListener('focus', () => setTimeout(updateDepartures, 500));

    Bootstrap.appUpdateCheck.then(updateAvailable => { appUpdateAvailable = updateAvailable; });
}

/* Local Variables: */
/* js2-additional-externs: ("El" "Storage" "Entur" "Bootstrap" "InputElement" "GeoComplete") */
/* End: */
