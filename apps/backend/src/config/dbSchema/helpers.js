const tableName = (name, schema) =>
  schema ? `${String(schema).toLowerCase()}.${name}` : name;

const EMPTY_SCHEMA = {};

const getTable = (key, schemaMap = EMPTY_SCHEMA) => schemaMap[key] || null;

const getColumns = (key, schemaMap = EMPTY_SCHEMA) =>
  schemaMap[key] ? schemaMap[key].COLS || {} : {};

const toCamel = (key = "") =>
  String(key)
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part : part[0].toUpperCase() + part.slice(1)
    )
    .join("");

const getDefinition = (key, schemaMap = EMPTY_SCHEMA) => {
  const entry = schemaMap[key];
  if (!entry) return null;
  const columns = Object.fromEntries(
    Object.entries(entry.COLS || {}).map(([colKey, colName]) => [
      toCamel(colKey),
      colName,
    ])
  );
  return {
    tableName: entry.TABLE,
    columns,
  };
};

module.exports = {
  tableName,
  getTable,
  getColumns,
  getDefinition,
};
