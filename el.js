/**********************************************************************************
 * Tiny El(ement) library for working with DOM elements.
 * Inspired by the API style of jQuery and replaces it entirely for this app.
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
    if (! (element instanceof Element)) {
        throw new TypeError('Only Element types can be wrapped by El');
    }
    this.element = element;
};

El.ElWrapper.prototype.unwrap = function() {
    return this.element;
};

El.unwrap = function(el) {
    return el instanceof El.ElWrapper ? el.unwrap() : el;
};

El.unwrapFlatten = function(...elements) {
    return elements.flatMap(elt => {
        if (Array.isArray(elt)) {
            return elt.map(El.unwrap).filter(e => e);
        }
        return elt ? El.unwrap(elt) : [];
    });
};

El.ElWrapper.prototype.hasClass = function(className) {
    return this.element.classList.contains(className);
};

El.ElWrapper.prototype.addClass = function(className) {
    this.element.classList.add(className);
    return this;
};

El.ElWrapper.prototype.removeClass = function(className) {
    this.element.classList.remove(className);
    return this;
};

El.ElWrapper.prototype.css = function(cssProperty, value) {
    if (value) {
        this.element.style.setProperty(cssProperty, value);
        return this;
    }
    return this.element.style.getPropertyValue(cssProperty);
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
    let elements = El.unwrapFlatten(...content);
    this.element.append(...elements);
    return this;
};

El.ElWrapper.prototype.setChildren = function(...content) {
    let elements = El.unwrapFlatten(...content);
    this.element.replaceChildren(...elements);
    return this;
};
El.ElWrapper.prototype.empty = function() {
    this.setChildren();
    return this;
}

El.ElWrapper.prototype.replaceWith = function(otherElement) {
    this.element.replaceWith(El.unwrap(otherElement));
    return this;
};

El.ElWrapper.prototype.replace = function(otherElement) {
    El.unwrap(otherElement).replaceWith(this.element);
    return this;
};

El.ElWrapper.prototype.remove = function() {
    this.element.remove();
    return this;
};

El.ElWrapper.prototype.appendTo = function(parentElement) {
    parentElement.append(this.element);
    return this;
};

El.ElWrapper.prototype.event = function(eventName, handler, options) {
    this.element.addEventListener(eventName, handler, options);
    return this;
};

El.ElWrapper.prototype.click = function(handler) {
    return this.event('click', handler);
};

El.ElWrapper.prototype.scrollTo = function(marginX, marginY) {
    const rect = this.element.getBoundingClientRect();
    const viewportHeight = window.visualViewport.height;
    const viewportWidth = window.visualViewport.width;

    if (!marginX) marginX = 10;
    if (!marginY) marginY = 10;
    
    let scrollX=0, scrollY=0;
    if (rect.left < 0) {
        scrollX = rect.left - marginX;
    } else if (rect.right > viewportWidth) {
        scrollX = rect.right - viewportWidth + marginX;
    }
    if (rect.top < 0) {
        scrollY = rect.top - marginY;
    } else if (rect.bottom > viewportHeight) {
        scrollY = rect.bottom - viewportHeight + marginY;
    }
    if (scrollX || scrollY) {
        window.scrollBy(scrollX, scrollY);
    }
    
    return this;
};

El.ElWrapper.prototype.focus = function() {
    this.element.focus();
    return this;
};

El.ElWrapper.prototype.show = function(cssDisplayShowValue) {
    if (cssDisplayShowValue) {
        this.element.style.setProperty('display', cssDisplayShowValue);
    } else if (this.element.style.display === 'none') {
        this.element.style.removeProperty('display');
    }
    return this;
};

El.ElWrapper.prototype.hide = function() {
    this.element.style.setProperty('display', 'none');
    return this;
};

El.ElWrapper.prototype.isHidden = function() {
    return this.element.style.display === 'none';
};

El.ElWrapper.prototype.fadeOut = function(animationDurationMilliseconds) {
    return new Promise((resolve) => {
        if (this.isHidden()) {
            resolve(this);
            return;
        }

        const endListener = ev => {
            this.hide();
            this.element.classList.remove('el-fadeout', 'el-fadein');
            if (animationDurationMilliseconds) {
                this.element.style.removeProperty('animationDuration');
            }
            
            setTimeout(() => resolve(this), 1);
        };
        this.element.addEventListener('animationend', endListener, { once: true });

        window.requestAnimationFrame(() => {
            if (animationDurationMilliseconds) {
                this.element.style.setProperty('animationDuration', animationDurationMilliseconds + 'ms');
            }
            if (! this.element.classList.replace('el-fadein', 'el-fadeout')) {
                this.element.classList.add('el-fadeout');
            }
        });
    });
};

El.ElWrapper.prototype.fadeIn = function(cssDisplayShowValue, animationDurationMilliseconds) {
    return new Promise((resolve) => {
        if (!this.isHidden()) {
            resolve(this);
            return;
        }

        const endListener = (ev) => {
            this.element.classList.remove('el-fadeout', 'el-fadein');
            if (animationDurationMilliseconds) {
                this.element.style.removeProperty('animationDuration');
            }
            setTimeout(() => resolve(this), 1);
        };
        this.element.addEventListener('animationend', endListener, { once: true });

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

El.ElWrapper.prototype.isAttached = function() {
    return this.element.parentElement !== null;
};

El.ElWrapper.prototype.prev = function() {
    return El.wrap(this.element.previousElementSibling);
};

El.ElWrapper.prototype.next = function() {
    return El.wrap(this.element.nextElementSibling);
};

El.ElWrapper.prototype.with = function(callback, ...args) {
    return callback.apply(this.element, this.element, ...args);
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
    if (element === null) {
        return null;
    }
    if (element instanceof El.ElWrapper) {
        return element;
    }
    
    return new El.ElWrapper(element);
};

El.byId = function(id) {
    return El.wrap(document.getElementById(id));
};

El.one = function(selector, context) {
    context = El.unwrap(context) || document;
    return El.wrap(context.querySelector(selector));
};

El.none = function(selector, context) {
    return El.one(selector, context) === null;
};

El.each = function(selector, callback, context) {
    context = El.unwrap(context) || document;
    context.querySelectorAll(selector).forEach(
        (element, idx) => callback.call(element, El.wrap(element), idx));
};

El.if = function(selectorOrElement, callback, context) {
    if (selectorOrElement instanceof Element) {
        return callback.call(selectorOrElement, El.wrap(selectorOrElement));
    } else if (typeof selectorOrElement === 'string') {
        const el = El.one(selectorOrElement, context);
        if (el) {
            return callback.call(el.unwrap(), el);
        }
    }
    return undefined;
};
