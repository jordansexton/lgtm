import ValidatorBuilder from '../validator_builder'

required = (value) ->
  if typeof value is 'string'
    value = value.trim()

  value not in ['', null, undefined]

email = (value) ->
  if typeof value is 'string'
    value = value.trim()

  # http://stackoverflow.com/a/46181/11236
  regexp = /^(([^<>()\[\]\\.,;:\s@\"]+(\.[^<>()\[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  regexp.test(value)

minLength = (minLength) ->
  if not minLength?
    throw new Error('must specify a min length')

  (value) ->
    if value?
      value.length >= minLength
    else
      no

maxLength = (maxLength) ->
  if not maxLength?
    throw new Error('must specify a max length')

  (value) ->
    if value?
      value.length <= maxLength
    else
      no

register = ->
  ValidatorBuilder.registerHelper 'required', required
  ValidatorBuilder.registerHelper 'email', email
  ValidatorBuilder.registerHelper 'minLength', minLength
  ValidatorBuilder.registerHelper 'maxLength', maxLength

export { required, email, minLength, maxLength, register }
