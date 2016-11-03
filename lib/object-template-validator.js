/**
 * The object validator allows validation of an object against a predefined template.
 * It uses the congruence API and adds some handy wrappers.
 */

var _ = require('lodash');
var congruence = require('congruence');
var events = require('events');

/**
 * This property is optional. The supplied function is tested if the property exists and is not undefined.
 * @param func
 * @returns {Function}
 */
var opt = function(func) {
    var f = function optional(v) {
        if (_.isUndefined(v)) {
            return true;
        } else {
            return func(v);
        }
    };
    f.args = arguments;
    return f;
};

/**
 * This property must exist, but may be null. The supplied function is tested only if the property is not null.
 * @param func
 * @returns {Function}
 */
var nullable = function(func) {
    var f = function nullable(v) {
        if (_.isNull(v)) {
            return true;
        } else {
            return func(v);
        }
    }
    f.args = arguments;
    return f;
};

/**
 * This property must exist, but may be anything (except undefined).
 * @param func
 * @returns {Function}
 */
var exists = function(func) {
    var f = function exists(v) {
        return (!_.isUndefined(v));
    };
    f.args = arguments;
    return f;
};

/**
 * This property should have an object that exactly matches the specified sub template.
 * Notice that if you also want to match sub-objects recursively
 * @param template
 *   A sub template.
 * @param {Boolean} [loose]
 *   If true, the object may have additional, unspecified, properties.
 * @returns {Function}
 */
var obj = function(template, loose) {
    var f = function object(value) {
        if (!_.isPlainObject(value)) {
            return false;
        }
        if (loose) {
            return congruence.similar(template, value, emitter);
        } else {
            return congruence.congruent(template, value, emitter);
        }
    };
    f.args = arguments;
    return f;
};

/**
 * Same as obj function, but also applies it to all descendant properties that are objects or arrays.
 * This is handy when using the validator for comparison of literal object structures.
 * @param {object} template
 * @param {Boolean} [loose]
 *   If true, the object may have additional, unspecified, properties.
 */
var recObj = function(template, loose) {
    if (!_.isPlainObject(template)) {
        throw 'recObj must be called on a plain object';
    }
    for (var key in template) {
        if (template.hasOwnProperty(key)) {
            (function(key) {
                if (_.isPlainObject(template[key])) {
                    template[key] = recObj(template[key], loose);
                } else if (_.isArray(template[key])) {
                    // Convert array to object.
                    var obj1 = {};
                    var templateValues = template[key];
                    for (var i = 0; i < templateValues.length; i++) {
                        obj1['' + i] = templateValues[i];
                    }

                    var f = function array(value) {
                        if (!_.isArray(value)) {
                            return false;
                        }

                        // Convert both arrays to objects so we can compare them as objects (this is required by the congruence module).
                        var i;
                        var obj2 = {};
                        for (i = 0; i < value.length; i++) {
                            obj2['' + i] = value[i];
                        }

                        return recObj(obj1, loose)(obj2);
                    };

                    // For template debugging.
                    f.extraDebugArgs = [templateValues];

                    template[key] = f;
                }
            })(key);
        }
    }
    return obj(template, loose);
};

/**
 * This property contains an array. Every item of the array is tested against the specified function.
 * @param func
 * @param {number} [minItems]
 *   Default is 0.
 * @param {number} [maxItems]
 * @returns {Function}
 */
var arr = function(func, minItems, maxItems) {
    if (minItems == undefined) {
        minItems = 0;
    }
    var f = function arr(list) {
        if (!_.isArray(list)) {
            return false;
        }
        return (list.length >= minItems) && (maxItems == undefined || list.length <= maxItems) && _.every(list, func);
    };
    f.args = arguments;
    return f;
};

/**
 * This property contains a hashmap from string to value. Every item of the array is tested against the specified function.
 * @param func
 * @param {number} [minItems]
 *   Default is 0.
 * @param {number} [maxItems]
 * @returns {Function}
 */
var hash = function(func, minItems, maxItems) {
    if (minItems == undefined) {
        minItems = 0;
    }
    var f = function hash(list) {
        if (!_.isPlainObject(list)) {
            return false;
        }
        var length = _.size(list);
        var valid = (length >= minItems) && (maxItems == undefined || length <= maxItems);
        if (!valid) return false;

        _.each(list, function(value, key) {
            if (!func(value)) {
                valid = false;
            }
        });

        return valid;
    };
    f.args = arguments;
    return f;
};

/**
 * Checks if all requirements match.
 * @param {...Function}
 *   Requirements.
 */
var and = function() {
    var funcs = arguments;
    var f = function and(value) {
        for (var i = 0; i < funcs.length; i++) {
            if (!funcs[i](value)) {
                return false;
            }
        }
        return true;
    }
    f.args = arguments;
    return f;
};

/**
 * Checks if any of the requirements match.
 * @param {...Function}
 *   Requirements.
 */
var or = function() {
    var funcs = arguments;
    var f = function or(value) {
        for (var i = 0; i < funcs.length; i++) {
            if (funcs[i](value)) {
                return true;
            }
        }
        return false;
    };
    f.args = arguments;
    return f;
};

/**
 * This property matches any of the options.
 * @param options
 */
var choice = function(options) {
    var f = function choice(value) {
        return (options.indexOf(value) != -1);
    };
    f.args = arguments;
    return f;
};

/**
 * Checks if the specified string is a validly formatted ISO date.
 * @param value
 */
var isISODate = function(value) {
    var regexp = /^\d{4}\-\d{2}\-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z(\+\d{2}:\d{2})?$/;
    return _.isString(value) && regexp.test(value);
};

/**
 * Validates the object against the template
 * @param template
 * @param object
 * @param {Boolean} [loose]
 *   If true, the object may have additional, unspecified, properties.
 * @param {Boolean} [loose]
 *   Normally, the validator checks for a literal match of sub objects without checking for validation funcitons.
 *   If set to true, the sub-properties are also checked for validation functions.
 */
var validateObject = function(template, object, loose, recursive) {
    messages = [];

    if (!_.isPlainObject(object)) {
        return false;
    }

    if (recursive) {
        return recObj(template, loose)(object);
    } else {
        if (loose) {
            return congruence.similar(template, object, emitter);
        } else {
            return congruence.congruent(template, object, emitter);
        }
    }
};

var emitter = new events.EventEmitter();

// Collect messages in an array for debugging purposes.
var messages = [];

emitter.on('invalid:keys', function(info) {
    messages.push(_.extend(info, {type: 'invalid:keys'}));
});

emitter.on('invalid:value', function(info) {
    messages.push(_.extend(info, {type: 'invalid:value'}));
});

/**
 * Returns the error messages since the last validateObject call.
 * @returns {Array}
 */
var getMessages = function() {
    return messages;
};

/**
 * Returns a textual description of the template.
 * @param {mixed} template
 */
var getTemplateDescription = function(template) {
    var description = "";
    if (_.isFunction(template) && template.name) {
        description += template.name + "(";
        var args = (template.args ? template.args : []);
        if (template.extraDebugArgs) {
            args = args.concat(template.extraDebugArgs);
        }
        if (args && (args.length > 0)) {
            for (var i = 0; i < args.length; i++) {
                var arg = args[i];
                if (i != 0) {
                    description += ",";
                }
                description += getTemplateDescription(arg);
            }
        }
        description += ")";
    } else if (_.isPlainObject(template)) {
        var items = [];
        _.each(_.keys(template), function(key) {
            items.push(key + ": " + getTemplateDescription(template[key]));
        });
        description = "{" + items.join(',') + "}";
    } else if (_.isArray(template)) {
        var items = [];
        _.each(_.keys(template), function(key) {
            items.push(getTemplateDescription(template[key]));
        });
        description = "[" + items.join(',') + "]";
    } else {
        description = JSON.stringify(template);
    }
    return description;
};

/**
 * Returns a textual description of the latest mismatch (if there is one).
 * @return {String}
 */
var getInvalidDescription = function() {
    // Incorrect params.
    var messages = getMessages();
    if (messages.length == 0) {
        return null;
    }

    var lastMessage = messages[0];
    var message = null;
    switch(lastMessage.type) {
        case 'invalid:keys':
            message = 'invalid keys, expecting [' + lastMessage.templateKeys.join(',') + '] but got [' + lastMessage.objectKeys.join(',') + '] (unexpected: [' + _.difference(lastMessage.objectKeys, lastMessage.templateKeys).join(',') + ']) (missing: [' + _.difference(lastMessage.templateKeys, lastMessage.objectKeys).join(',') + '])';
            break;
        case 'invalid:value':
            message = "invalid value for key '" + lastMessage.key + "': '" + JSON.stringify(lastMessage.objectNode) + "'";

            // Add template description.
            var desc = getTemplateDescription(lastMessage.templateNode);
            message += "; expectation: " + desc;
            break;
    }
    return message;
};

module.exports = {
    opt: opt,
    nullable: nullable,
    obj: obj,
    recObj: recObj,
    exists: exists,
    arr: arr,
    hash: hash,
    and: and,
    or: or,
    choice: choice,
    isISODate: isISODate,
    validateObject: validateObject,
    events: emitter,
    getMessages: getMessages,
    getInvalidDescription: getInvalidDescription,
    getTemplateDescription: getTemplateDescription
};