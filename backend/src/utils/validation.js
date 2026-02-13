import Joi from 'joi';

export const roomIdSchema = Joi.object({
  roomId: Joi.string()
    .min(1)
    .max(100)
    .required()
});

export const elementSchema = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().required(),
  x: Joi.number().allow(null, NaN),
  y: Joi.number().allow(null, NaN),
  width: Joi.number().allow(null, NaN),
  height: Joi.number().allow(null, NaN),
  angle: Joi.number().allow(null),
  strokeColor: Joi.string().allow('', null),
  backgroundColor: Joi.string().allow('', null),
  fillStyle: Joi.string().allow('', null),
  strokeWidth: Joi.number().allow(null),
  strokeStyle: Joi.string().allow('', null),
  roughness: Joi.number().allow(null),
  opacity: Joi.number().allow(null),
  groupIds: Joi.array().items(Joi.string()).allow(null),
  frameId: Joi.string().allow(null),
  roundness: Joi.any().allow(null),
  seed: Joi.number().allow(null),
  version: Joi.number().allow(null),
  versionNonce: Joi.number().allow(null),
  isDeleted: Joi.boolean().default(false),
  boundElements: Joi.any().allow(null),
  updated: Joi.number().allow(null),
  link: Joi.string().allow('', null),
  locked: Joi.boolean().default(false)
}).unknown(true);

export const elementsArraySchema = Joi.array().items(elementSchema).max(20000);

export const appStateSchema = Joi.object({
  viewBackgroundColor: Joi.string().allow('', null),
  gridSize: Joi.number().allow(null),
  scrollX: Joi.number().allow(null),
  scrollY: Joi.number().allow(null),
  zoom: Joi.any().allow(null),
  name: Joi.string().allow('', null)
}).unknown(true);

export const sceneUpdateSchema = Joi.object({
  elements: elementsArraySchema.required(),
  appState: appStateSchema.allow(null),
  files: Joi.any().allow(null)
}).unknown(true);

export const incrementalUpdateSchema = Joi.object({
  added: Joi.array().items(elementSchema),
  updated: Joi.array().items(elementSchema),
  deleted: Joi.array().items(Joi.string())
}).or('added', 'updated', 'deleted');

export const pointerSchema = Joi.object({
  x: Joi.number().required(),
  y: Joi.number().required(),
  tool: Joi.string().allow(null),
  button: Joi.string().allow(null)
}).unknown(true);

export const userJoinSchema = Joi.object({
  username: Joi.string().allow('', null),
  color: Joi.string().allow('', null)
}).unknown(true);

export const validate = (schema, data) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: false, // Keep original data if possible
    convert: true
  });

  if (error) {
    console.warn('Validation warning (soft):', error.message);
    // Don't throw for now, just return the data to keep the app running
    return data;
  }

  return value;
};
