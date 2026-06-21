const { v4: uuidv4 } = require('uuid');

const MESSAGE_TYPE = { CALL: 2, CALLRESULT: 3, CALLERROR: 4 };

const OCPP_ERRORS = {
  NotImplemented: 'Requested Action is not known by receiver',
  NotSupported: 'Requested Action is recognized but not supported by the receiver',
  InternalError: 'An internal error occurred and the receiver was not able to process the requested Action successfully',
  ProtocolError: 'Payload for Action is incomplete or syntactically incorrect',
  SecurityError: 'During the processing of Action a security issue occurred preventing receiver from completing the Action successfully',
  FormationViolation: 'Payload is syntactically incorrect or not conform the PDU structure for Action',
  PropertyConstraintViolation: 'Payload is syntactically correct but at least one field contains an invalid value',
  OccurrenceConstraintViolation: 'Payload for Action is syntactically correct but violates some additional occurrence constraints',
  TypeConstraintViolation: 'Payload for Action is syntactically correct but at least one field contains an invalid data type',
  GenericError: 'Any other error not covered by the other error codes'
};

function parseMessage(raw) {
  try {
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length < 3) return null;
    var type = arr[0];
    if (type === MESSAGE_TYPE.CALL && arr.length === 4) {
      return { type: type, uniqueId: arr[1], action: arr[2], payload: arr[3] || {} };
    }
    if (type === MESSAGE_TYPE.CALLRESULT && arr.length === 3) {
      return { type: type, uniqueId: arr[1], payload: arr[2] || {} };
    }
    if (type === MESSAGE_TYPE.CALLERROR && arr.length >= 4) {
      return { type: type, uniqueId: arr[1], errorCode: arr[2], errorDescription: arr[3], errorDetails: arr[4] || {} };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function buildCall(action, payload) {
  return JSON.stringify([MESSAGE_TYPE.CALL, uuidv4(), action, payload || {}]);
}

function buildCallResult(uniqueId, payload) {
  return JSON.stringify([MESSAGE_TYPE.CALLRESULT, uniqueId, payload || {}]);
}

function buildCallError(uniqueId, errorCode, errorDescription) {
  return JSON.stringify([MESSAGE_TYPE.CALLERROR, uniqueId, errorCode, errorDescription || OCPP_ERRORS[errorCode] || '', {}]);
}

module.exports = { MESSAGE_TYPE, OCPP_ERRORS, parseMessage, buildCall, buildCallResult, buildCallError };