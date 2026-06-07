import type { MaskingStrategy, ProofmarkConfig } from '../config/types.js'

const SCALAR_TYPES = new Set([
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'DateTime',
  'Bytes',
  'Json',
])

export type PrismaFieldKind = 'scalar' | 'enum' | 'relation' | 'unsupported'

export type PrismaField = {
  name: string
  type: string
  baseType: string
  kind: PrismaFieldKind
  isList: boolean
  isOptional: boolean
  attributes: Array<string>
  dbName?: string
  isId: boolean
  isUnique: boolean
  isIgnored: boolean
  hasDefault: boolean
}

export type PrismaModel = {
  name: string
  dbName?: string
  documentation: Array<string>
  isIgnored: boolean
  fields: Array<PrismaField>
}

export type PrismaSchema = {
  models: Array<PrismaModel>
  enums: Array<string>
}

type ParsedModelDraft = Omit<PrismaModel, 'fields'> & {
  fieldDrafts: Array<Omit<PrismaField, 'kind'>>
}

/**
 * Parses the model and enum surface needed for Day 1 proofmark config
 * generation. It intentionally avoids executing Prisma or loading env vars.
 */
export function parsePrismaSchema(schema: string): PrismaSchema {
  const withoutBlockComments = schema.replace(/\/\*[\s\S]*?\*\//g, '')
  const enumNames = parseEnumNames(withoutBlockComments)
  const modelDrafts = parseModelDrafts(withoutBlockComments)
  const modelNames = new Set(modelDrafts.map((model) => model.name))

  return {
    enums: enumNames,
    models: modelDrafts.map((model) => ({
      name: model.name,
      ...(model.dbName ? { dbName: model.dbName } : {}),
      documentation: model.documentation,
      isIgnored: model.isIgnored,
      fields: model.fieldDrafts.map((field) => ({
        ...field,
        kind: getFieldKind(field.baseType, enumNames, modelNames),
      })),
    })),
  }
}

/**
 * Creates an initial masking object from scalar Prisma fields with likely PII.
 */
export function createMaskingConfig(
  schema: PrismaSchema,
): ProofmarkConfig['masking'] {
  const masking: ProofmarkConfig['masking'] = {}

  for (const model of schema.models) {
    if (model.isIgnored) {
      continue
    }

    const modelRules: Record<string, MaskingStrategy> = {}

    for (const field of model.fields) {
      if (field.isIgnored || field.kind !== 'scalar' || field.isList) {
        continue
      }

      const strategy = inferMaskingStrategy(model.name, field)
      if (strategy) {
        modelRules[field.name] = strategy
      }
    }

    if (Object.keys(modelRules).length > 0) {
      masking[model.name] = modelRules
    }
  }

  return masking
}

function parseEnumNames(schema: string): Array<string> {
  const enumNames: Array<string> = []
  const enumPattern = /^\s*enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm
  let match = enumPattern.exec(schema)

  while (match) {
    const enumName = match[1]
    if (enumName) {
      enumNames.push(enumName)
    }
    match = enumPattern.exec(schema)
  }

  return enumNames
}

function parseModelDrafts(schema: string): Array<ParsedModelDraft> {
  const lines = schema.split(/\r?\n/)
  const models: Array<ParsedModelDraft> = []
  let documentationBuffer: Array<string> = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    const trimmed = line.trim()

    if (trimmed.startsWith('///')) {
      documentationBuffer.push(trimmed.slice(3).trim())
      continue
    }

    const modelMatch = /^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(trimmed)
    if (!modelMatch) {
      if (trimmed !== '') {
        documentationBuffer = []
      }
      continue
    }

    const modelName = modelMatch[1]
    if (!modelName) {
      documentationBuffer = []
      continue
    }

    const bodyLines: Array<string> = []
    lineIndex += 1

    while (lineIndex < lines.length) {
      const bodyLine = lines[lineIndex] ?? ''
      if (bodyLine.trim() === '}') {
        break
      }
      bodyLines.push(bodyLine)
      lineIndex += 1
    }

    const modelAttributes = bodyLines
      .map((bodyLine) => bodyLine.trim())
      .filter((bodyLine) => bodyLine.startsWith('@@'))

    const dbName = getMappedName(modelAttributes)

    models.push({
      name: modelName,
      ...(dbName ? { dbName } : {}),
      documentation: documentationBuffer,
      isIgnored: modelAttributes.includes('@@ignore'),
      fieldDrafts: parseFieldDrafts(bodyLines),
    })

    documentationBuffer = []
  }

  return models
}

function parseFieldDrafts(
  bodyLines: Array<string>,
): Array<Omit<PrismaField, 'kind'>> {
  const fields: Array<Omit<PrismaField, 'kind'>> = []

  for (const bodyLine of bodyLines) {
    const withoutLineComment = stripLineComment(bodyLine).trim()
    if (
      withoutLineComment === '' ||
      withoutLineComment.startsWith('@@') ||
      withoutLineComment.startsWith('//') ||
      withoutLineComment.startsWith('///')
    ) {
      continue
    }

    const fieldMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+(\S+)(?:\s+(.*))?$/.exec(
      withoutLineComment,
    )
    if (!fieldMatch) {
      continue
    }

    const [, name, rawType, attributeSource = ''] = fieldMatch
    if (!name || !rawType) {
      continue
    }

    const attributes = scanAttributes(attributeSource)
    const baseType = getBaseType(rawType)
    const dbName = getMappedName(attributes)

    fields.push({
      name,
      type: rawType,
      baseType,
      isList: rawType.endsWith('[]'),
      isOptional: rawType.endsWith('?'),
      attributes,
      ...(dbName ? { dbName } : {}),
      isId: attributes.includes('@id'),
      isUnique: attributes.includes('@unique'),
      isIgnored: attributes.includes('@ignore'),
      hasDefault: attributes.some((attribute) => attribute.startsWith('@default')),
    })
  }

  return fields
}

function getFieldKind(
  baseType: string,
  enumNames: Array<string>,
  modelNames: Set<string>,
): PrismaFieldKind {
  if (baseType.startsWith('Unsupported(')) {
    return 'unsupported'
  }

  if (SCALAR_TYPES.has(baseType)) {
    return 'scalar'
  }

  if (enumNames.includes(baseType)) {
    return 'enum'
  }

  if (modelNames.has(baseType)) {
    return 'relation'
  }

  return 'unsupported'
}

function getBaseType(rawType: string): string {
  return rawType.replace(/\[\]$/, '').replace(/\?$/, '')
}

function stripLineComment(line: string): string {
  let inString = false
  let quote = ''

  for (let index = 0; index < line.length - 1; index += 1) {
    const current = line[index]
    const next = line[index + 1]

    if ((current === '"' || current === "'") && line[index - 1] !== '\\') {
      if (!inString) {
        inString = true
        quote = current
      } else if (quote === current) {
        inString = false
        quote = ''
      }
    }

    if (!inString && current === '/' && next === '/') {
      return line.slice(0, index)
    }
  }

  return line
}

function scanAttributes(source: string): Array<string> {
  const attributes: Array<string> = []
  let index = 0

  while (index < source.length) {
    const atIndex = source.indexOf('@', index)
    if (atIndex === -1) {
      break
    }

    let cursor = atIndex + 1
    while (cursor < source.length && /[A-Za-z0-9_.]/.test(source[cursor] ?? '')) {
      cursor += 1
    }

    if (source[cursor] === '(') {
      cursor += 1
      let depth = 1
      let inString = false
      let quote = ''

      while (cursor < source.length && depth > 0) {
        const current = source[cursor] ?? ''
        const previous = source[cursor - 1]

        if ((current === '"' || current === "'") && previous !== '\\') {
          if (!inString) {
            inString = true
            quote = current
          } else if (quote === current) {
            inString = false
            quote = ''
          }
        } else if (!inString && current === '(') {
          depth += 1
        } else if (!inString && current === ')') {
          depth -= 1
        }

        cursor += 1
      }
    }

    attributes.push(source.slice(atIndex, cursor).trim())
    index = cursor
  }

  return attributes
}

function getMappedName(attributes: Array<string>): string | undefined {
  for (const attribute of attributes) {
    const match = /^@@?map\("([^"]+)"\)/.exec(attribute)
    if (match?.[1]) {
      return match[1]
    }
  }

  return undefined
}

function inferMaskingStrategy(
  modelName: string,
  field: PrismaField,
): MaskingStrategy | undefined {
  const name = field.name.toLowerCase()
  const qualifiedName = `${modelName}.${field.name}`.toLowerCase()

  if (field.isId || name === 'id' || name.endsWith('id')) {
    if (!/(stripe|customer|token|secret|session|external)/.test(name)) {
      return undefined
    }
  }

  if (/(password|passwordhash|password_hash)/.test(name)) {
    return {
      strategy: 'static',
      value: '$2b$10$proofmarkLOCALDEVHASHPLACEHOLDER',
    }
  }

  if (/(email|e_mail)/.test(name)) {
    return 'faker.internet.email'
  }

  if (/(phone|mobile|telephone)/.test(name)) {
    return 'faker.phone.number'
  }

  if (/(firstname|first_name)/.test(name)) {
    return 'faker.person.firstName'
  }

  if (/(lastname|last_name|surname)/.test(name)) {
    return 'faker.person.lastName'
  }

  if (/(fullname|full_name|displayname|display_name)/.test(name)) {
    return 'faker.person.fullName'
  }

  if (/(address|street)/.test(name)) {
    return 'faker.location.streetAddress'
  }

  if (/city/.test(name)) {
    return 'faker.location.city'
  }

  if (/(zip|postal)/.test(name)) {
    return 'faker.location.zipCode'
  }

  if (/(card|credit|cc_|iban|routing|bank|accountnumber)/.test(name)) {
    return 'scramble'
  }

  if (/(stripe|token|secret|apikey|api_key|session|oauth)/.test(qualifiedName)) {
    return 'scramble'
  }

  if (/(ipaddress|ip_address)/.test(name)) {
    return 'faker.internet.ip'
  }

  if (/(useragent|user_agent)/.test(name)) {
    return 'faker.internet.userAgent'
  }

  if (/(ssn|socialsecurity|taxid|tax_id|ein)/.test(name)) {
    return 'scramble'
  }

  return undefined
}
