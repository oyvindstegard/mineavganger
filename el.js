/**********************************************************************************
 * Tiny El(ement) library for working with DOM elements.
 * Inspired by the API style of jQuery and is meant to replace it entirely.
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
    this.element = element;
};

El.ElWrapper.prototype.addClass = function(className) {
    this.element.classList.add(className);
    return this;
};

El.ElWrapper.prototype.removeClass = function(className) {
    this.element.classList.remove(className);
    return this;
};

El.ElWrapper.prototype.id = function(id) {
    if (id) {
        this.element.setAttribute('id', id);
        return this;
    }

    return this.element.getAttribute('id');
};

El.ElWrapper.prototype.attr = function(name, value) {
    if (value) {
        this.element.setAttribute(name, value);
        return this;
    } else {
        return this.element.getAttribute(name);
    }
};

El.ElWrapper.prototype.data = function(name, value) {
    if (value) {
        this.element.dataset[name] = value;
        return this;
    } else {
        return this.element.dataset[name];
    }
};

El.ElWrapper.prototype.val = function(value) {
    if (value) {
        this.element.value = value;
        return this;
    }
    return this.element.value;
};

El.ElWrapper.prototype.text = function(textContent) {
    this.element.innerText = textContent;
    return this;
};

El.ElWrapper.prototype.html = function(htmlContent) {
    this.element.innerHTML = htmlContent;
    return this;
};

El.ElWrapper.prototype.append = function(...content) {
    for (let elt of content) {
        if (Array.isArray(elt)) {
            this.append(...elt);
            continue;
        }
        if (elt instanceof El.ElWrapper) {
            elt = elt.unwrap();
        }
        if (elt) {
            this.element.append(elt);
        }
    }
    return this;
};

El.ElWrapper.prototype.replaceWith = function(otherElement) {
    if (otherElement instanceof El.ElWrapper) {
        otherElement = otherElement.unwrap();
    }
    this.element.replaceWith(otherElement);
    return this;
};

El.ElWrapper.prototype.appendTo = function(parentElement) {
    parentElement.append(this.element);
    return this;
};

El.ElWrapper.prototype.event = function(eventName, handler) {
    this.element.addEventListener(eventName, handler);
    return this;
};

El.ElWrapper.prototype.click = function(handler) {
    return this.event('click', handler);
};

El.ElWrapper.prototype.show = function(cssDisplayShowValue) {
    if (this.element.style.display === 'none') {
        this.element.style.removeProperty('display');
    }

    if (!this.isVisible() || this.element.parentElement === null) {
        // Computed style likely makes element not displayed by default, override required.
        this.element.style.display = cssDisplayShowValue ? cssDisplayShowValue : 'block';
    }
    return this;
};

El.ElWrapper.prototype.hide = function() {
    this.element.style.removeProperty('display');
    if (this.isVisible() || this.element.parentElement === null) {
        // Computed style likely makes element displayed by default, or element not attached to DOM yet.
        this.element.style.display = 'none';
    }
    return this;
};

El.ElWrapper.prototype.focus = function() {
    this.element.focus();
    return this;
};

El.ElWrapper.prototype.fadeOut = function(animationDurationMilliseconds) {
    return new Promise((resolve) => {
        if (!this.isVisible()) {
            resolve(self);
            return;
        }

        const endListener = (ev) => {
            this.hide();
            this.element.classList.remove('el-fadeout', 'el-fadein');
            if (animationDurationMilliseconds) {
                this.element.style.removeProperty('animationDuration');
            }
            this.element.removeEventListener('animationend', endListener);
            setTimeout(() => resolve(this), 1);
        };
        
        this.element.addEventListener('animationend', endListener);

        window.requestAnimationFrame(() => {
            if (animationDurationMilliseconds) {
                this.element.style.animationDuration = animationDurationMilliseconds + 'ms';
            }
            if (! this.element.classList.replace('el-fadein', 'el-fadeout')) {
                this.element.classList.add('el-fadeout');
            }
        });
    });
};

El.ElWrapper.prototype.fadeIn = function(cssDisplayShowValue, animationDurationMilliseconds) {
    return new Promise((resolve) => {
        if (this.isVisible()) {
            resolve(this);
            return;
        }

        const endListener = (ev) => {
            this.element.classList.remove('el-fadeout', 'el-fadein');
            if (animationDurationMilliseconds) {
                this.element.style.removeProperty('animationDuration');
            }
            this.element.removeEventListener('animationend', endListener);
            setTimeout(() => resolve(this), 1);
        };
        this.element.addEventListener('animationend', endListener);

        window.requestAnimationFrame(() => {
            if (animationDurationMilliseconds) {
                this.element.style.animationDuration = animationDurationMilliseconds + 'ms';
            }
            if (! this.element.classList.replace('el-fadeout', 'el-fadein')) {
                this.element.classList.add('el-fadein');
                this.show(cssDisplayShowValue);
            }
        });
    });
};

El.ElWrapper.prototype.isVisible = function() {
    return this.element.checkVisibility();
};

El.ElWrapper.prototype.unwrap = function() {
    return this.element;
};

El.ElWrapper.prototype.toString = function() {
    return `[object El.ElWrapper ${this.element}]`;
};

El.defaultAnimDurationMilliseconds = 100;

El.createStyleElement = function() {
    const styleElem = document.createElement('style');
    styleElem.innerText = `
.el-fadeout {
  animation-name: el-fadeout-animation;
  animation-duration: ${El.defaultAnimDurationMilliseconds}ms;
  animation-fill-mode: forwards;
}
.el-fadein {
  animation-name: el-fadein-animation;
  animation-duration: ${El.defaultAnimDurationMilliseconds}ms;
  animation-fill-mode: forwards;
}
@keyframes el-fadeout-animation {
  0% {
    opacity: 100%;
    visibility: visible;
  }
  100% {
    opacity: 0%;
    visibility: hidden;
  }
}
@keyframes el-fadein-animation {
  0% {
    opacity: 0;
    visibility: hidden;
  }
  100% {
    opacity: 100%;
    visibility: visible;
  }
}
`;
    return styleElem;
};
document.getElementsByTagName('head').item(0).append(El.createStyleElement());

El.wrap = function(element) {
    if (element instanceof El.ElWrapper) {
        return element;
    }
    
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

El.each = function(selector, callback) {
    document.querySelectorAll(selector).forEach((element) => callback(El.wrap(element)));
};
