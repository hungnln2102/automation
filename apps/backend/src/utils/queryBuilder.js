/**
 * SQL Query Builder Utilities
 * Provides reusable functions to build complex SQL queries
 * Reduces code duplication and improves maintainability
 * 
 * @module utils/queryBuilder
 * 
 * @description
 * These utilities are designed to work alongside existing raw SQL queries.
 * They can be gradually adopted without breaking existing functionality.
 * 
 * All functions return SQL strings that can be used with Knex.raw() or db.raw()
 */

const { quoteIdent, createDateNormalization, createNumericExtraction } = require("./sql");

/**
 * Build a date range filter for WHERE clause
 * 
 * @param {string} dateColumn - Column name (will be automatically quoted)
 * @param {string} startDate - Start date (ISO format, e.g., '2024-01-01')
 * @param {string} endDate - End date (ISO format, e.g., '2024-12-31')
 * @returns {string} SQL condition string
 * 
 * @example
 * // Returns: "normalized_date >= :startDate::date AND normalized_date < :endDate::date"
 * buildDateRangeFilter('order_date', '2024-01-01', '2024-12-31')
 */
const buildDateRangeFilter = (dateColumn, startDate, endDate) => {
  const quotedCol = quoteIdent(dateColumn);
  const normalizedDate = createDateNormalization(quotedCol);
  
  if (startDate && endDate) {
    return `${normalizedDate} >= :startDate::date AND ${normalizedDate} < :endDate::date`;
  } else if (startDate) {
    return `${normalizedDate} >= :startDate::date`;
  } else if (endDate) {
    return `${normalizedDate} < :endDate::date`;
  }
  return "TRUE";
};

/**
 * Build a numeric range filter for WHERE clause
 * @param {string} numericColumn - Column name (will be quoted)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {string} SQL condition
 */
const buildNumericRangeFilter = (numericColumn, min, max) => {
  const quotedCol = quoteIdent(numericColumn);
  const extractedNumeric = createNumericExtraction(quotedCol);
  
  const conditions = [];
  if (min !== undefined && min !== null) {
    conditions.push(`${extractedNumeric} >= :minValue`);
  }
  if (max !== undefined && max !== null) {
    conditions.push(`${extractedNumeric} <= :maxValue`);
  }
  
  return conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
};

/**
 * Build a text search filter for WHERE clause
 * @param {string} textColumn - Column name (will be quoted)
 * @param {string} searchTerm - Search term
 * @param {boolean} caseSensitive - Whether search is case sensitive
 * @returns {string} SQL condition
 */
const buildTextSearchFilter = (textColumn, searchTerm, caseSensitive = false) => {
  if (!searchTerm) return "TRUE";
  
  const quotedCol = quoteIdent(textColumn);
  const operator = caseSensitive ? "LIKE" : "ILIKE";
  const value = caseSensitive ? `:searchTerm` : `LOWER(:searchTerm)`;
  const column = caseSensitive ? quotedCol : `LOWER(${quotedCol})`;
  
  return `${column} ${operator} ${value}`;
};

/**
 * Build a status filter for WHERE clause
 * @param {string} statusColumn - Column name (will be quoted)
 * @param {string|string[]} statuses - Single status or array of statuses
 * @returns {string} SQL condition
 */
const buildStatusFilter = (statusColumn, statuses) => {
  if (!statuses) return "TRUE";
  
  const quotedCol = quoteIdent(statusColumn);
  const statusArray = Array.isArray(statuses) ? statuses : [statuses];
  
  if (statusArray.length === 0) return "TRUE";
  if (statusArray.length === 1) {
    return `${quotedCol} = :status`;
  }
  
  // Use IN clause for multiple statuses
  const placeholders = statusArray.map((_, i) => `:status${i}`).join(", ");
  return `${quotedCol} IN (${placeholders})`;
};

/**
 * Build a SELECT clause with column aliases
 * @param {Object} columns - Object with { alias: column } mapping
 * @returns {string} SELECT clause
 */
const buildSelectClause = (columns) => {
  const selects = Object.entries(columns).map(([alias, column]) => {
    const quotedCol = typeof column === "string" ? quoteIdent(column) : column;
    return `${quotedCol} AS ${quoteIdent(alias)}`;
  });
  
  return selects.join(", ");
};

/**
 * Build a UNION query from multiple SELECT statements
 * @param {string[]} selectQueries - Array of SELECT query strings
 * @param {boolean} all - Use UNION ALL instead of UNION
 * @returns {string} Combined query
 */
const buildUnionQuery = (selectQueries, all = true) => {
  if (selectQueries.length === 0) return "";
  if (selectQueries.length === 1) return selectQueries[0];
  
  const unionOperator = all ? "UNION ALL" : "UNION";
  return selectQueries.join(` ${unionOperator} `);
};

/**
 * Build a pagination clause
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Items per page
 * @returns {string} LIMIT and OFFSET clause
 */
const buildPaginationClause = (page, pageSize) => {
  const limit = Math.max(1, pageSize || 10);
  const offset = Math.max(0, ((page || 1) - 1) * limit);
  
  return `LIMIT ${limit} OFFSET ${offset}`;
};

/**
 * Build a CTE (Common Table Expression)
 * @param {string} name - CTE name
 * @param {string} query - SELECT query for CTE
 * @returns {string} CTE clause
 */
const buildCTE = (name, query) => {
  return `${quoteIdent(name)} AS (${query})`;
};

/**
 * Build multiple CTEs
 * @param {Object} ctes - Object with { name: query } mapping
 * @returns {string} WITH clause with all CTEs
 */
const buildCTEs = (ctes) => {
  const cteClauses = Object.entries(ctes).map(([name, query]) => 
    buildCTE(name, query)
  );
  
  return `WITH ${cteClauses.join(", ")}`;
};

/**
 * Build a CASE WHEN statement
 * @param {Array<{condition: string, value: string}>} cases - Array of {condition, value}
 * @param {string} elseValue - Default value
 * @returns {string} CASE statement
 */
const buildCaseStatement = (cases, elseValue = "NULL") => {
  const whenClauses = cases.map(({ condition, value }) => 
    `WHEN ${condition} THEN ${value}`
  ).join(" ");
  
  return `CASE ${whenClauses} ELSE ${elseValue} END`;
};

/**
 * Build aggregate filter (FILTER clause in PostgreSQL)
 * @param {string} aggregateFunction - Function name (e.g., COUNT, SUM)
 * @param {string} filterCondition - WHERE condition for FILTER
 * @param {string} column - Column to aggregate (optional)
 * @returns {string} Aggregate expression with FILTER
 */
const buildAggregateFilter = (aggregateFunction, filterCondition, column = "*") => {
  return `${aggregateFunction}(${column}) FILTER (WHERE ${filterCondition})`;
};

module.exports = {
  buildDateRangeFilter,
  buildNumericRangeFilter,
  buildTextSearchFilter,
  buildStatusFilter,
  buildSelectClause,
  buildUnionQuery,
  buildPaginationClause,
  buildCTE,
  buildCTEs,
  buildCaseStatement,
  buildAggregateFilter,
};
