(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (factory((global.LGTM = global.LGTM || {})));
}(this, function (exports) { 'use strict';

  var config = {};

  function keys(object) {
    return Object.getOwnPropertyNames(object);
  }

  /**
   * Property access
   */

  function get(object, property) {
    if (object === null || object === undefined) {
      return;
    } else if (typeof object.get === 'function') {
      return object.get(property);
    } else {
      return object[property];
    }
  }

  function getProperties(object, properties) {
    var get = config.get;

    return properties.map(function (prop) {
      return get(object, prop);
    });
  }

  /**
   * Array manipulation
   */

  function contains(array, object) {
    return array.indexOf(object) > -1;
  }

  function uniq(array) {
    var result = [];

    for (var i = 0; i < array.length; i++) {
      var item = array[i];
      if (!contains(result, item)) {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Promises
   */

  function resolve(thenable) {
    var Promise = config.Promise;

    return new Promise(function (accept) {
      return accept(thenable);
    });
  }

  function all(thenables) {
    var Promise = config.Promise;

    return Promise.all(thenables);
  }

  function ObjectValidator() {
    this._validations = {};
    this._dependencies = {};
  }

  ObjectValidator.prototype = {
    _validations: null,
    _dependencies: null,

    addValidation: function addValidation(attr, fn, message) {
      var list = this._validations[attr];

      if (!list) {
        list = this._validations[attr] = [];
      }

      list.push([fn, message]);
    },


    // e.g. spouseName (dependentAttribute) depends on maritalStatus (parentAttribute)
    addDependentsFor: function addDependentsFor() /* parentAttribute, ...dependentAttributes */{
      var dependentAttributes = [].slice.apply(arguments);
      var parentAttribute = dependentAttributes.shift();

      var dependentsForParent = this._dependencies[parentAttribute];

      if (!dependentsForParent) {
        dependentsForParent = this._dependencies[parentAttribute] = [];
      }

      for (var i = 0; i < dependentAttributes.length; i++) {
        var attr = dependentAttributes[i];
        if (!contains(dependentsForParent, attr)) {
          dependentsForParent.push(attr);
        }
      }
    },
    attributes: function attributes() {
      return uniq(keys(this._validations).concat(keys(this._dependencies)));
    },
    validate: function validate() /* object, attributes..., callback */{
      var attributes = [].slice.apply(arguments);
      var object = attributes.shift();
      var callback = attributes.pop();
      var self = this;

      if (typeof callback === 'string') {
        attributes.push(callback);
        callback = null;
      }

      if (attributes.length === 0) {
        attributes = keys(this._validations);
      }

      var validationPromises = [];
      var alreadyValidating = attributes.slice();
      for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        validationPromises = validationPromises.concat(this._validateAttribute(object, attr, alreadyValidating));
      }

      var promise = all(validationPromises).then(function (results) {
        results = self._collectResults(results);
        if (callback) {
          callback(null, results);
        }
        return results;
      }, function (err) {
        if (callback) {
          callback(err);
        }
        throw err;
      });

      if (!callback) {
        return promise;
      }
    },
    _validateAttribute: function _validateAttribute(object, attr, alreadyValidating) {
      var value = config.get(object, attr);
      var validations = this._validations[attr];
      var results = [];

      if (validations) {
        validations.forEach(function (pair) {
          var fn = pair[0];
          var message = pair[1];

          var promise = resolve().then(function () {
            return fn(value, attr, object);
          }).then(function (isValid) {
            return [attr, isValid ? null : message];
          });

          results.push(promise);
        });
      } else if (contains(this.attributes(), attr)) {
        results.push([attr, null]);
      }

      var dependents = this._getDependentsFor(attr);
      for (var i = 0; i < dependents.length; i++) {
        var dependent = dependents[i];
        if (alreadyValidating.indexOf(dependent) < 0) {
          alreadyValidating.push(dependent);
          results = results.concat(this._validateAttribute(object, dependent, alreadyValidating));
        }
      }

      return results;
    },
    _collectResults: function _collectResults(results) {
      var result = {
        valid: true,
        errors: {}
      };

      for (var i = 0; i < results.length; i++) {
        if (!results[i]) {
          continue;
        }

        var attr = results[i][0];
        var message = results[i][1];
        var messages = result.errors[attr];

        if (!messages) {
          messages = result.errors[attr] = [];
        }

        if (message) {
          messages.push(message);
          result.valid = false;
        }
      }

      return result;
    },


    // e.g. getDependents("maritalStatus")  # => ["spouseName"]
    _getDependentsFor: function _getDependentsFor(parentAttribute) {
      return (this._dependencies[parentAttribute] || []).slice();
    }
  };

  function ValidatorBuilder() {
    this._validator = new ObjectValidator();
  }

  ValidatorBuilder.prototype = {
    _attr: null,
    _conditions: null,
    _conditionDependencies: null,
    _validator: null,

    validates: function validates(attr) {
      this._attr = attr;
      this._conditions = [];
      this._conditionDependencies = [];
      return this;
    },
    when: function when() /* ...dependencies, condition */{
      var dependencies = [].slice.apply(arguments);
      var condition = dependencies.pop();

      if (dependencies.length === 0) {
        dependencies = [this._attr];
      }

      for (var i = 0; i < dependencies.length; i++) {
        var dependency = dependencies[i];
        if (dependency !== this._attr) {
          this._validator.addDependentsFor(dependency, this._attr);
        }
      }

      this._conditions.push(condition);
      this._conditionDependencies.push(dependencies);
      return this;
    },
    and: function and() /* ...dependencies, condition */{
      return this.when.apply(this, arguments);
    },
    using: function using() /* ...dependencies, predicate, message */{
      var dependencies = [].slice.apply(arguments);
      var message = dependencies.pop();
      var predicate = dependencies.pop();

      if (typeof message === 'undefined') {
        throw new Error('expected a message but got: ' + message);
      }

      if (typeof message === 'function' && typeof predicate === 'undefined') {
        throw new Error('missing expected argument `message` after predicate function');
      }

      if (dependencies.length === 0) {
        dependencies = [this._attr];
      }

      for (var i = 0; i < dependencies.length; i++) {
        var dependency = dependencies[i];
        if (dependency !== this._attr) {
          this._validator.addDependentsFor(dependency, this._attr);
        }
      }

      function validation(value, attr, object) {
        var properties = getProperties(object, dependencies);
        return predicate.apply(null, properties.concat([attr, object]));
      }

      var conditions = this._conditions.slice();
      var conditionDependencies = this._conditionDependencies.slice();

      function validationWithConditions(value, attr, object) {
        return all(conditions.map(function (condition, i) {
          var dependencies = conditionDependencies[i];
          var properties = getProperties(object, dependencies);
          return condition.apply(null, properties.concat([attr, object]));
        })).then(function (results) {
          for (var _i = 0; _i < results.length; _i++) {
            // a condition resolved to a falsy value; return as valid
            if (!results[_i]) {
              return true;
            }
          }
          // all conditions resolved to truthy values; continue with validation
          return validation(value, attr, object);
        });
      }

      this._validator.addValidation(this._attr, conditions ? validationWithConditions : validation, message);
      return this;
    },
    build: function build() {
      return this._validator;
    }
  };

  ValidatorBuilder.registerHelper = function (name, fn) {
    this.prototype[name] = function () {
      fn.apply(this, arguments);
      return this;
    };
    return null;
  };

  ValidatorBuilder.unregisterHelper = function (name) {
    delete this.prototype[name];
    return null;
  };

  function present(value) {
    if (typeof value === 'string') {
      value = value.trim();
    }

    return value !== '' && value !== null && value !== undefined;
  }

  var STRICT_CHARS = /^[\x20-\x7F]*$/;
  // http://stackoverflow.com/a/46181/11236
  var EMAIL = /^(([^<>()\[\]\\.,;:\s@\"]+(\.[^<>()\[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  function checkEmail(options) {
    if (!options) {
      options = {};
    }

    return function (value) {
      if (typeof value === 'string') {
        value = value.trim();
      }

      if (options.strictCharacters) {
        if (!STRICT_CHARS.test(value)) {
          return false;
        }
      }

      return EMAIL.test(value);
    };
  }

  function checkMinLength(minLength) {
    if (minLength === null || minLength === undefined) {
      throw new Error('must specify a min length');
    }

    return function (value) {
      if (value !== null && value !== undefined) {
        return value.length >= minLength;
      } else {
        return false;
      }
    };
  }

  function checkMaxLength(maxLength) {
    if (maxLength === null || maxLength === undefined) {
      throw new Error('must specify a max length');
    }

    return function (value) {
      if (value !== null && value !== undefined) {
        return value.length <= maxLength;
      } else {
        return false;
      }
    };
  }

  function register$1() {
    ValidatorBuilder.registerHelper('required', function (message) {
      this.using(present, message);
    });

    ValidatorBuilder.registerHelper('optional', function () {
      this.when(present);
    });

    ValidatorBuilder.registerHelper('email', function (message, options) {
      this.using(checkEmail(options), message);
    });

    ValidatorBuilder.registerHelper('minLength', function (minLength, message) {
      this.using(checkMinLength(minLength), message);
    });

    ValidatorBuilder.registerHelper('maxLength', function (maxLength, message) {
      this.using(checkMaxLength(maxLength), message);
    });
  }

  register$1();

  function validator() {
    return new ValidatorBuilder();
  }

  function register() {
    ValidatorBuilder.registerHelper.apply(ValidatorBuilder, arguments);
  }

  function unregister() {
    ValidatorBuilder.unregisterHelper.apply(ValidatorBuilder, arguments);
  }

  var helpers = {
    core: {
      present: present,
      checkEmail: checkEmail,
      checkMinLength: checkMinLength,
      checkMaxLength: checkMaxLength,
      register: register$1
    },
    register: register,
    unregister: unregister
  };

  function configure(key, value) {
    config[key] = value;
  }

  configure('defer', function () {
    var Promise = config['Promise'];
    var resolve = void 0;
    var reject = void 0;
    var promise = new Promise(function (res, rej) {
      resolve = res;
      reject = rej;
    });

    if (!resolve || !reject) {
      throw new Error('Configured promise does not behave as expected');
    }

    return { promise: promise, resolve: resolve, reject: reject };
  });

  function PromiseProxy(callback) {
    var Promise = getPromise();
    return new Promise(callback);
  }

  PromiseProxy.all = function () {
    var _getPromise;

    return (_getPromise = getPromise()).all.apply(_getPromise, arguments);
  };

  PromiseProxy.race = function () {
    var _getPromise2;

    return (_getPromise2 = getPromise()).race.apply(_getPromise2, arguments);
  };

  PromiseProxy.resolve = function () {
    var _getPromise3;

    return (_getPromise3 = getPromise()).resolve.apply(_getPromise3, arguments);
  };

  PromiseProxy.reject = function () {
    var _getPromise4;

    return (_getPromise4 = getPromise()).reject.apply(_getPromise4, arguments);
  };

  function getPromise() {
    var warn = config['warn'];

    /* global Promise, RSVP, require */
    if (typeof RSVP !== 'undefined') {
      configure('Promise', RSVP.Promise);
      warn('Implicitly using RSVP.Promise. This will be removed in LGTM 2.0. ' + 'Instead, use \'LGTM.configure("Promise", RSVP.Promise)\' to ' + 'continue using RSVP promises.');
      return RSVP.Promise;
    }

    if (typeof require === 'function') {
      try {
        var _require = require('rsvp'),
            _Promise = _require.Promise;

        configure('Promise', _Promise);
        warn('Implicitly using require("rsvp").Promise. This will be removed in LGTM 2.0. ' + 'Instead, use \'LGTM.configure("Promise", require("rsvp").Promise)\' to ' + 'continue using RSVP promises.');
        return _Promise;
      } catch (err) {
        // Ignore errors, just try built-in Promise or fail.
      }
    }

    if (typeof Promise === 'function') {
      configure('Promise', Promise);
      return Promise;
    }

    throw new Error('\'Promise\' could not be found. Configure LGTM with your promise library using ' + 'e.g. \'LGTM.configure("Promise", RSVP.Promise)\'.');
  }

  /* global console */
  configure('Promise', PromiseProxy);
  configure('warn', console.warn.bind(console)); // eslint-disable-line no-console
  configure('get', function (object, property) {
    var warn = config['warn'];

    configure('get', get);
    warn('Implicitly using \'get\' implementation that uses a \'get\' method when available. ' + 'This will be removed in LGTM 2.0. Instead, use e.g. \'LGTM.configure("get", Ember.get)\' ' + 'if you rely on this behavior.');
    return get(object, property);
  });

  exports.configure = configure;
  exports.validator = validator;
  exports.helpers = helpers;
  exports.ObjectValidator = ObjectValidator;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=lgtm.js.map