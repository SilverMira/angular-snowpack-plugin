/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
// tslint:disable-next-line: no-implicit-dependencies
import { ApplicationRef, PlatformRef, isDevMode, ɵresetCompiledComponents } from '@angular/core';
import { filter, take } from 'rxjs/operators';
export default function (mod) {
    if (!mod['hot']) {
        return;
    }
    if (!isDevMode()) {
        console.error("[NG HMR] Cannot use HMR when Angular is running in production mode. To prevent production mode, do not call 'enableProdMode()'.");
        return;
    }
    mod['hot'].accept();
    mod['hot'].dispose(function () {
        if (typeof ng === 'undefined') {
            console.warn("[NG HMR] Cannot find global 'ng'. Likely this is caused because scripts optimization is enabled.");
            return;
        }
        if (!ng.getInjector) {
            // View Engine
            return;
        }
        // Reset JIT compiled components cache
        ɵresetCompiledComponents();
        var appRoot = getAppRoot();
        if (!appRoot) {
            return;
        }
        var appRef = getApplicationRef(appRoot);
        if (!appRef) {
            return;
        }
        // Inputs that are hidden should be ignored
        var oldInputs = document.querySelectorAll('input:not([type="hidden"]), textarea');
        var oldOptions = document.querySelectorAll('option');
        // Create new application
        appRef.components
            .forEach(function (cp) {
            var element = cp.location.nativeElement;
            var parentNode = element.parentNode;
            parentNode.insertBefore(document.createElement(element.tagName), element);
            parentNode.removeChild(element);
        });
        // Destroy old application, injectors, <style..., etc..
        var platformRef = getPlatformRef(appRoot);
        if (platformRef) {
            platformRef.destroy();
        }
        // Restore all inputs and options
        var bodyElement = document.body;
        if ((oldInputs.length + oldOptions.length) === 0 || !bodyElement) {
            return;
        }
        // Use a `MutationObserver` to wait until the app-root element has been bootstrapped.
        // ie: when the ng-version attribute is added.
        new MutationObserver(function (_mutationsList, observer) {
            observer.disconnect();
            var newAppRoot = getAppRoot();
            if (!newAppRoot) {
                return;
            }
            var newAppRef = getApplicationRef(newAppRoot);
            if (!newAppRef) {
                return;
            }
            // Wait until the application isStable to restore the form values
            newAppRef.isStable
                .pipe(filter(function (isStable) { return !!isStable; }), take(1))
                .subscribe(function () { return restoreFormValues(oldInputs, oldOptions); });
        })
            .observe(bodyElement, {
            attributes: true,
            subtree: true,
            attributeFilter: ['ng-version']
        });
    });
}
function getAppRoot() {
    var appRoot = document.querySelector('[ng-version]');
    if (!appRoot) {
        console.warn('[NG HMR] Cannot find the application root component.');
        return undefined;
    }
    return appRoot;
}
function getToken(appRoot, token) {
    return typeof ng === 'object' && ng.getInjector(appRoot).get(token) || undefined;
}
function getApplicationRef(appRoot) {
    var appRef = getToken(appRoot, ApplicationRef);
    if (!appRef) {
        console.warn("[NG HMR] Cannot get 'ApplicationRef'.");
        return undefined;
    }
    return appRef;
}
function getPlatformRef(appRoot) {
    var platformRef = getToken(appRoot, PlatformRef);
    if (!platformRef) {
        console.warn("[NG HMR] Cannot get 'PlatformRef'.");
        return undefined;
    }
    return platformRef;
}
function dispatchEvents(element) {
    element.dispatchEvent(new Event('input', {
        bubbles: true,
        cancelable: true
    }));
    element.blur();
    element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
}
function restoreFormValues(oldInputs, oldOptions) {
    // Restore input that are not hidden
    var newInputs = document.querySelectorAll('input:not([type="hidden"]), textarea');
    if (newInputs.length && newInputs.length === oldInputs.length) {
        console.log('[NG HMR] Restoring input/textarea values.');
        for (var index = 0; index < newInputs.length; index++) {
            var newElement = newInputs[index];
            var oldElement = oldInputs[index];
            switch (oldElement.type) {
                case 'button':
                case 'image':
                case 'submit':
                case 'reset':
                    // These types don't need any value change.
                    continue;
                case 'radio':
                case 'checkbox':
                    newElement.checked = oldElement.checked;
                    break;
                case 'color':
                case 'date':
                case 'datetime-local':
                case 'email':
                case 'file':
                case 'hidden':
                case 'month':
                case 'number':
                case 'password':
                case 'range':
                case 'search':
                case 'tel':
                case 'text':
                case 'textarea':
                case 'time':
                case 'url':
                case 'week':
                    newElement.value = oldElement.value;
                    break;
                default:
                    console.warn('[NG HMR] Unknown input type ' + oldElement.type + '.');
                    continue;
            }
            dispatchEvents(newElement);
        }
    }
    else if (oldInputs.length) {
        console.warn('[NG HMR] Cannot restore input/textarea values.');
    }
    // Restore option
    var newOptions = document.querySelectorAll('option');
    if (newOptions.length && newOptions.length === oldOptions.length) {
        console.log('[NG HMR] Restoring selected options.');
        for (var index = 0; index < newOptions.length; index++) {
            var newElement = newOptions[index];
            newElement.selected = oldOptions[index].selected;
            dispatchEvents(newElement);
        }
    }
    else if (oldOptions.length) {
        console.warn('[NG HMR] Cannot restore selected options.');
    }
}
