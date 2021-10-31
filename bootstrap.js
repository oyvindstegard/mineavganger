/**********************************************************************************
 *  Boot strap: load deps in list order and trigger app init
 **********************************************************************************
 */

'use strict';

const dependencies = ['jquery-3.6.0.min.js',
                      'jquery.autocomplete.min.js',
                      'storage.js',
                      'entur.js',
                      'app.js'];

(function loadDependencies(onDependenciesLoaded) {

    const head = document.getElementsByTagName('head')[0];
    const baseUrl = document.currentScript.src.replace(/[^\/]*$/, '');

    const firstScript = document.createElement('script');
    firstScript.src = baseUrl + dependencies[0];

    let script = firstScript;
    for (let i=1; i<dependencies.length; i++) {
        const nextScript = document.createElement('script');
        script.onload = function(ev) {
            nextScript.src = baseUrl + dependencies[i];
            head.appendChild(nextScript);
        };
        script = nextScript;
    }
    script.onload = onDependenciesLoaded;

    head.appendChild(firstScript);
})(function() {
    $(document).ready(appInit);
});

/* Local Variables: */
/* js2-additional-externs: ("$" "appInit") */
/* End: */
