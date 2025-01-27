/**********************************************************************************
 * Autocomplete widget for Geocoder API
 **********************************************************************************
 * Requires:
 * - el.js
 * - entur.js
 */

'use strict';

const GeoComplete = function(inputElement, transportMode, onSelect, onInvalidateSelected) {
    inputElement = El.wrap(inputElement);

    let currentAbortController = null;
    const fetchSuggestions = async function (text) {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }

        if (text.length < 2) {
            return [];
        }

        currentAbortController = new AbortController();
        try {
            const geocoderJsonResponse = await Entur.fetchGeocoderResults(
                text, transportMode, currentAbortController.signal);

            if (! (Array.isArray(geocoderJsonResponse.features))) {
                throw new Error('Unfamiliar response data from Geocoder API');
            }

            const suggestions = geocoderJsonResponse.features
                  .filter(feature => feature.properties.label && feature.properties.id)
                  .map(feature => {
                      return {
                          'label': feature.properties.label,
                          'id': feature.properties.id
                      };
                  });

            return suggestions;
        } finally {
            currentAbortController = null;
        }
    };

    const debounce = (asyncFn, timeoutMillis) => {
        let timeoutId;
        return function(immediate, ...args) {
            return new Promise((resolve, reject) => {
                clearTimeout(timeoutId);
                const invocation = () => {
                    timeoutId = null;
                    asyncFn.apply(this, args)
                        .then(resolve)
                        .catch(reject);
                };
                if (immediate) {
                    invocation();
                } else {
                    timeoutId = setTimeout(invocation, timeoutMillis);
                }
            });
        };
    };

    const suggestionBox = El('div.suggestion-box').hide();

    const select = (suggestionId, suggestionLabel) => {
        inputElement
            .val(suggestionLabel)
            .data('geoCompleteLastSelectedLabel', suggestionLabel);
        if (typeof onSelect === 'function') {
            onSelect.call(inputElement.unwrap(), suggestionId, suggestionLabel);
        }
    };

    const invalidate = () => {
        if (typeof onInvalidateSelected === 'function') {
            onInvalidateSelected.call(inputElement.unwrap());
        }
    };

    const maybeShowSuggestions = (text, suggestions) => {
        if (!suggestionBox.isAttached()) {
            // Lazily attach to DOM and initialize
            inputElement.next(suggestionBox);
            
            suggestionBox
                .event('click', ev => {
                    El.if(ev.target.closest('.suggestion-item'), el => {
                        if (el.data('suggestionId') && el.data('suggestionLabel')) {
                            select(el.data('suggestionId'), el.data('suggestionLabel'));
                        }
                    });
                })
                .event('mousemove', ev => {
                    El.if(ev.target.closest('li.suggestion-item'), el => {
                        El.each('li.suggestion-item.selected', el => {
                            el.removeClass('selected');
                        }, suggestionBox);

                        el.addClass('selected');
                    });
                });
        }
        
        if (! (text && suggestions && suggestions.length)) {
            suggestionBox.hide().empty();
            return;
        }
        if (! inputElement.hasFocus()) {
            suggestionBox.hide().empty();
            return;
        }
        if (suggestions.length === 1
            && suggestions[0].label === inputElement.data('geoCompleteLastSelectedLabel')
            && suggestions[0].label === inputElement.val()) {
            suggestionBox.hide().empty();
            return;
        }

        const suggestionList = El('ul.suggestion-list');

        suggestions.forEach(suggestion => {
            const listItem = El('li.suggestion-item')
                      .data('suggestionId', suggestion.id)
                      .data('suggestionLabel', suggestion.label);
            const highlightedText = suggestion.label.replace(new RegExp(text, "gi"), "<b>$&</b>");
            listItem.append(El('span.suggestion-text').html(highlightedText));

            suggestionList.append(listItem);
        });

        const boxWidth = inputElement.unwrap().getBoundingClientRect().width - 2;

        suggestionBox
            .css('width', boxWidth + 'px')
            .setChildren(suggestionList)
            .show();
    };

    const hideSuggestionBoxEventListener = () => suggestionBox.hide();
    
    const debouncedFetch = debounce(fetchSuggestions, 300);

    const inputListener = (ev) => {
        const text = ev.target.value.trim();
        
        if (inputElement.data('geoCompleteLastSelectedLabel')
            && text !== inputElement.data('geoCompleteLastSelectedLabel')) {
            inputElement.data('geoCompleteLastSelectedLabel', null);
            invalidate();
        }

        const immediateDispatch = (ev.type === 'focus');

        debouncedFetch(immediateDispatch, text)
            .then((suggestions) => maybeShowSuggestions(text, suggestions))
            .catch(() => maybeShowSuggestions(null, []));
    };

    const keydownListener = (ev) => {
        if (suggestionBox.isHidden()) {
            return;
        }
        if (ev.keyCode === 9) {
            suggestionBox.hide();
            return;
        }
        if (ev.keyCode === 38 || ev.keyCode === 40) {
            ev.preventDefault();
            const selectedEl = El.one('li.suggestion-item.selected', suggestionBox);
            if (selectedEl) {
                let toSelectEl = null;
                if (ev.keyCode === 38 && selectedEl.prev()) {
                    toSelectEl = selectedEl.prev();
                } else if (ev.keyCode === 40 && selectedEl.next()) {
                    toSelectEl = selectedEl.next();
                }
                if (toSelectEl) {
                    selectedEl.removeClass('selected');
                    toSelectEl.addClass('selected');
                    window.requestAnimationFrame(() => {
                        toSelectEl.unwrap().scrollIntoView({block: 'nearest'});
                    });
                }
            } else {
                if (ev.keyCode === 38) return;

                El.if('li.suggestion-item', function(el) {
                    el.addClass('selected');
                    window.requestAnimationFrame(() => {
                        this.scrollIntoView({block: 'nearest'});
                    });
                }, suggestionBox);
            }
            return;
        }
        if (ev.keyCode === 13) {
            El.if('li.suggestion-item.selected', el => {
                ev.preventDefault();
                select(el.data('suggestionId'), el.data('suggestionLabel'));
            }, suggestionBox);
            
            suggestionBox.hide();
            return;
        }
        if (ev.keyCode === 27) {
            suggestionBox.hide();
            return;
        }
    };

    window.addEventListener('click', hideSuggestionBoxEventListener);

    inputElement.event('input', inputListener)
        .event('focus', inputListener)
        .event('keydown', keydownListener);

    this.dispose = function() {
        inputElement.with(function() {
            this.removeEventListener('input', inputListener);
            this.removeEventListener('focus', inputListener);
            this.removeEventListener('keydown', keydownListener);
        });
        window.removeEventListener('click', hideSuggestionBoxEventListener);
        
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }

        suggestionBox.remove();
    };

};

/* Local Variables: */
/* js2-additional-externs: ("El" "Entur" "AbortController") */
/* End: */
