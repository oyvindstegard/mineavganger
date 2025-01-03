/**********************************************************************************
 * Tiny El(ement) library for working with DOM elements. (Replaces use of jQuery.)
 **********************************************************************************
 */

'use strict';

const El = function(nameClassId, attrs) {
    const [name, classes, id] = El.parseNameClassId(nameClassId);

    const element = document.createElement(name);
    
    for (const clazz of classes) {
        element.classList.add(clazz);
    }
    if (id) {
        element.setAttribute('id', id);
    }

    if (typeof attrs === 'object') {
        for (const [name, value] of Object.entries(attrs)) {
            element.setAttribute(name, value);
        }
    }

    return El.wrap(element);
};

El.parseNameClassId = function(nameClassId) {
    let name='', clazz='', id='', classes=[];
    let state = 'name';
    for (const c of nameClassId) {
        switch (c) {
        case '.':
            if (!name) throw new Error('Unparseable «nameClassId», element name is missing');
            if (clazz) {
                classes.push(clazz);
                clazz = '';
            }
            state = 'clazz';
            continue;
        case '#':
            if (id || !name) throw new Error('Unparseable «nameClassId», id cannot occur multiple times or element name is missing');
            state = 'id';
            continue;
        default:
            switch (state) {
            case 'name':
                name += c;
                continue;
            case 'clazz':
                clazz += c;
                continue;
            case 'id':
                id += c;
                continue;
            }
        }
    }
    if (clazz) {
        classes.push(clazz);
    }
    
    return [name ? name : null, classes, id ? id : null];
};

El.ElWrapper = function(element) {
    this.addClass = function(className) {
        element.classList.add(className);
        return this;
    };

    this.removeClass = function(className) {
        element.classList.remove(className);
        return this;
    };

    this.id = function(id) {
        element.setAttribute('id', id);
        return this;
    };

    this.attr = function(name, value) {
        if (value) {
            element.setAttribute(name, value);
            return this;
        } else {
            return element.getAttribute(name);
        }
    };

    this.data = function(name, value) {
        if (value) {
            element.dataset[name] = value;
            return this;
        } else {
            return element.dataset[name];
        }
    };

    this.val = function(value) {
        if (value) {
            element.value = value;
            return this;
        }
        return element.value;
    };

    this.text = function(textContent) {
        element.innerText = textContent;
        return this;
    };

    this.html = function(htmlContent) {
        element.innerHTML = htmlContent;
        return this;
    };

    this.append = function(...content) {
        for (let elt of content) {
            if (Array.isArray(elt)) {
                this.append(...elt);
                continue;
            }
            if (elt instanceof El.ElWrapper) {
                elt = elt.unwrap();
            }
            element.append(elt);
        }
        return this;
    };

    this.appendTo = function(parentElement) {
        parentElement.append(element);
        return this;
    };

    this.event = function(eventName, handler) {
        element.addEventListener(eventName, handler);
        return this;
    };

    this.click = function(handler) {
        return this.event('click', handler);
    };

    this.show = function() {
        if (element.dataset.elPreviousDisplayStyle) {
            element.style.display = element.dataset.elPreviousDisplayStyle;
            delete element.dataset.elPreviousDisplayStyle;
        } else {
            element.style.removeProperty('display');
        }
        return this;
    };

    this.hide = function() {
        if (element.style.display) {
            element.dataset.elPreviousDisplayStyle = element.style.display;
        }
        element.style.display = 'none';
        return this;
    };

    this.focus = function() {
        element.focus();
        return this;
    };

    this.unwrap = function() {
        return element;
    };
};

El.wrap = function(element) {
    return new El.ElWrapper(element);
};

El.byId = function(id) {
    const element = document.getElementById(id);
    if (element === null) {
        return null;
    }
    return El.wrap(element);
};

El.one = function(selector) {
    const element = document.querySelector(selector);
    if (element === null) {
        return null;
    }
    return El.wrap(element);
};
