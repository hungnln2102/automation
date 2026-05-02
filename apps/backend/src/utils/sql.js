const createDateNormalization = (column) => `
  CASE
    WHEN ${column} IS NULL THEN NULL
    WHEN TRIM(${column}::text) = '' THEN NULL
    WHEN TRIM(${column}::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      THEN SUBSTRING(TRIM(${column}::text) FROM 1 FOR 10)::date
    WHEN TRIM(${column}::text) ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}'
      THEN TO_DATE(SUBSTRING(TRIM(${column}::text) FROM 1 FOR 10), 'YYYY/MM/DD')
    WHEN TRIM(${column}::text) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
      THEN TO_DATE(SUBSTRING(TRIM(${column}::text) FROM 1 FOR 10), 'DD/MM/YYYY')
    WHEN TRIM(${column}::text) ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}'
      THEN TO_DATE(SUBSTRING(TRIM(${column}::text) FROM 1 FOR 10), 'DD-MM-YYYY')
    WHEN TRIM(${column}::text) ~ '^[0-9]{8}$'
      THEN TO_DATE(TRIM(${column}::text), 'YYYYMMDD')
    ELSE NULL
  END
`;

const createYearExtraction = (column) => `
  CASE
    WHEN ${column} IS NULL THEN NULL
    WHEN TRIM(${column}::text) = '' THEN NULL
    WHEN TRIM(${column}::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      THEN SUBSTRING(TRIM(${column}::text) FROM 1 FOR 4)::int
    WHEN TRIM(${column}::text) ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}'
      THEN SUBSTRING(TRIM(${column}::text) FROM 1 FOR 4)::int
    WHEN TRIM(${column}::text) ~ '^[0-9]{4}(?:$|[^0-9])'
      THEN SUBSTRING(TRIM(${column}::text) FROM 1 FOR 4)::int
    WHEN TRIM(${column}::text) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
      THEN SUBSTRING(TRIM(${column}::text) FROM 7 FOR 4)::int
    WHEN TRIM(${column}::text) ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}'
      THEN SUBSTRING(TRIM(${column}::text) FROM 7 FOR 4)::int
    WHEN TRIM(${column}::text) ~ '^[0-9]{8}$'
      THEN SUBSTRING(TRIM(${column}::text) FROM 1 FOR 4)::int
    ELSE NULL
  END
`;

const createSourceKey = (column) => `
  LOWER(
    REGEXP_REPLACE(
      TRIM(${column}::text),
      '\\s+',
      ' ',
      'g'
    )
  )
`;

const createNumericExtraction = (column) => `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(TRIM(${column}::text), '[^0-9\\-\\.]+', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

// Use raw column value for comparisons; no trimming, lowercasing, or diacritic removal.
const createVietnameseStatusKey = (column) => `${column}`;

const quoteIdent = (value) => {
  const str = value === undefined || value === null ? "" : String(value);
  const sanitized = str.replace(/"/g, '""');
  return `"${sanitized}"`;
};

module.exports = {
  createDateNormalization,
  createYearExtraction,
  createSourceKey,
  createNumericExtraction,
  createVietnameseStatusKey,
  quoteIdent,
};
