/*************************************************************************************
 * Boot strap: load js-deps in list order, register serviceworker and trigger appInit
 *************************************************************************************
 */

'use strict';

const Bootstrap = {};

Bootstrap.scriptUrl = new URL(document.currentScript.src);
Bootstrap.basePath = Bootstrap.scriptUrl.pathname.replace(/[^\/]*$/, '');
Bootstrap.V = Bootstrap.scriptUrl.searchParams.get('_V') ?
    Bootstrap.scriptUrl.searchParams.get('_V') : '0';

Bootstrap.scriptDependencies = ['el.js',
                                'storage.js',
                                'entur.js',
                                'geocomplete.js',
                                'app.js']
    .map(scriptName => scriptName + '?_V=' + Bootstrap.V);

Bootstrap.serviceWorkerScript = 'serviceworker.js';

Bootstrap.appUpdateCheck = new Promise((resolve, reject) => {
    if ('serviceWorker' in navigator) {
        const currentControllingWorker = navigator.serviceWorker.controller;

        window.addEventListener('load', () => {
            navigator.serviceWorker.register(Bootstrap.serviceWorkerScript)
                .then(registration => {
                    console.log('Service worker registered for scope ' + registration.scope);
                    registration.addEventListener('updatefound', () => {
                        console.log('A new service worker is being installed.');
                        const installingWorker = registration.installing;
                        installingWorker.addEventListener('statechange', () => {
                            if (installingWorker.state === 'installed'
                                && currentControllingWorker
                                && installingWorker !== currentControllingWorker) {
                                resolve(true);
                            } else {
                                resolve(false);
                            }
                        });
                    });
                })
                .catch(() => {
                    console.error("Service worker registration failed.");
                    resolve(false);
                });
        });
    } else {
        resolve(false);
    }
});

Bootstrap.loadScriptDependencies = () => {
    return new Promise((resolve, reject) => {
        const deps = Bootstrap.scriptDependencies;
        const head = document.getElementsByTagName('head')[0];

        const firstScript = document.createElement('script');
        firstScript.src = Bootstrap.basePath + deps[0];

        let script = firstScript;
        for (let i=1; i<deps.length; i++) {
            const nextScript = document.createElement('script');
            script.onload = (ev) => {
                nextScript.src = Bootstrap.basePath + deps[i];
                head.appendChild(nextScript);
            };
            script = nextScript;
        }
        script.onload = () => resolve(true);

        head.appendChild(firstScript);        
    });
};

Bootstrap.loadScriptDependencies().then(() => appInit());

/* Local Variables: */
/* js2-additional-externs: ("appInit" "URL") */
/* End: */
