Object Validator
----------------

Allows validation of an object against a template.

Example:

`function validate(notification, callback){
    var ov = require('objectValidator');
    var _ = require('lodash');

    var obj = ov.obj, arr = ov.arr, opt = ov.opt, choice = ov.choice, and = ov.and, nullable = ov.nullable;
    var notificationTemplate = {
        id: opt(_.isString),
        operator: _.isString,
        country: _.isString,
        environment: _.isString,
        active: _.isBoolean,
        type: and(_.isString, choice(['call2action', 'notification'])),
        start: ov.isISODate,
        end: nullable(ov.isISODate),
        app: nullable(obj({
            identifier: _.isString,
            params: _.isObject
        })),
        matches: arr(obj({
            "and": arr(obj({
                    type: _.isString,
                    values: opt(arr(function(value) {return /^\/.+\/[a-z]*$/.test(value)})),
                    rawValues: arr(_.isString)
                }))
            })
        ),
        notification: obj(
            {
                message: _.isString,
                retry: nullable(_.isNumber),
                repeat: nullable(_.isNumber),
                image: nullable(_.isString)
            }
        ),
        referenceId: opt(nullable(_.isString))
    };

    if (!ov.validateObject(notificationTemplate, notification)) {
        return callback(new ResponseError('error.stbNotification.invalid', 'objectStructureMismatch: ' + ov.getInvalidDescription()));
    }

    callback();
};`

In a template, you can use functions or wrappers. Wrappers, such as obj({..}) can be used to define a sub-object. The
validateObject function should be used to validate the object against the template. objectValidator provides uses the
congruence API internally, which emits errors when the object does not match the template. These emitted errors can be
fetched after validation by the getMessages method. The getInvalidDescription provides a textual description of what
was wrong.

Other interesting wrapper functions are:
opt(f): key is optional, or f(value) is true
nullable(f): value may be null, or f(value) is true
obj(obj): value must be an object according to the specified template
recObj(obj): same as obj, but if some keys of the template have a value that is an object or an array, the obj function is
 applied recursively to those keys. This allows the user to match a literal object in a template.
exists: key must exist but the value does not matter
arr(f): value is an array in which each entry matches the specified validation function.
and(f1, f2): f1(value) && f2(value)
or(f1, f2): f1(value) || f2(value)
choice(array): value must be in array
isISODate(v): validates an ISO Date-formatted string (2015-04-28T10:00.000Z)

Other library functions/properties:
validateObject(template, object): validates the specified object against the specified template.
getMessages: returns validation errors after a call to validateObject.
getInvalidDescription: returns a description of why the object did not match the template.
getTemplateDescription: returns a textual description of the specified template.
