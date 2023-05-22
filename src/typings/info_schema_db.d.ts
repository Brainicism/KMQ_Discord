import type { ColumnType } from "kysely";

export type Decimal = ColumnType<string, string | number, string | number>;

export interface ALLPLUGINS {
  PLUGIN_NAME: string;
  PLUGIN_VERSION: string;
  PLUGIN_STATUS: string;
  PLUGIN_TYPE: string;
  PLUGIN_TYPE_VERSION: string;
  PLUGIN_LIBRARY: string | null;
  PLUGIN_LIBRARY_VERSION: string | null;
  PLUGIN_AUTHOR: string | null;
  PLUGIN_DESCRIPTION: string | null;
  PLUGIN_LICENSE: string;
  LOAD_OPTION: string;
  PLUGIN_MATURITY: string;
  PLUGIN_AUTH_VERSION: string | null;
}

export interface APPLICABLEROLES {
  GRANTEE: string;
  ROLE_NAME: string;
  IS_GRANTABLE: string;
  IS_DEFAULT: string | null;
}

export interface CHARACTERSETS {
  CHARACTER_SET_NAME: string;
  DEFAULT_COLLATE_NAME: string;
  DESCRIPTION: string;
  MAXLEN: number;
}

export interface CHECKCONSTRAINTS {
  CONSTRAINT_CATALOG: string;
  CONSTRAINT_SCHEMA: string;
  TABLE_NAME: string;
  CONSTRAINT_NAME: string;
  CHECK_CLAUSE: string;
}

export interface CLIENTSTATISTICS {
  CLIENT: string;
  TOTAL_CONNECTIONS: number;
  CONCURRENT_CONNECTIONS: number;
  CONNECTED_TIME: number;
  BUSY_TIME: number;
  CPU_TIME: number;
  BYTES_RECEIVED: number;
  BYTES_SENT: number;
  BINLOG_BYTES_WRITTEN: number;
  ROWS_READ: number;
  ROWS_SENT: number;
  ROWS_DELETED: number;
  ROWS_INSERTED: number;
  ROWS_UPDATED: number;
  SELECT_COMMANDS: number;
  UPDATE_COMMANDS: number;
  OTHER_COMMANDS: number;
  COMMIT_TRANSACTIONS: number;
  ROLLBACK_TRANSACTIONS: number;
  DENIED_CONNECTIONS: number;
  LOST_CONNECTIONS: number;
  ACCESS_DENIED: number;
  EMPTY_QUERIES: number;
  TOTAL_SSL_CONNECTIONS: number;
  MAX_STATEMENT_TIME_EXCEEDED: number;
}

export interface COLLATIONCHARACTERSETAPPLICABILITY {
  COLLATION_NAME: string;
  CHARACTER_SET_NAME: string;
}

export interface COLLATIONS {
  COLLATION_NAME: string;
  CHARACTER_SET_NAME: string;
  ID: number;
  IS_DEFAULT: string;
  IS_COMPILED: string;
  SORTLEN: number;
}

export interface COLUMNPRIVILEGES {
  GRANTEE: string;
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  PRIVILEGE_TYPE: string;
  IS_GRANTABLE: string;
}

export interface COLUMNS {
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  ORDINAL_POSITION: number;
  COLUMN_DEFAULT: string | null;
  IS_NULLABLE: string;
  DATA_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
  CHARACTER_OCTET_LENGTH: number | null;
  NUMERIC_PRECISION: number | null;
  NUMERIC_SCALE: number | null;
  DATETIME_PRECISION: number | null;
  CHARACTER_SET_NAME: string | null;
  COLLATION_NAME: string | null;
  COLUMN_TYPE: string;
  COLUMN_KEY: string;
  EXTRA: string;
  PRIVILEGES: string;
  COLUMN_COMMENT: string;
  IS_GENERATED: string;
  GENERATION_EXPRESSION: string | null;
}

export interface ENABLEDROLES {
  ROLE_NAME: string | null;
}

export interface ENGINES {
  ENGINE: string;
  SUPPORT: string;
  COMMENT: string;
  TRANSACTIONS: string | null;
  XA: string | null;
  SAVEPOINTS: string | null;
}

export interface EVENTS {
  EVENT_CATALOG: string;
  EVENT_SCHEMA: string;
  EVENT_NAME: string;
  DEFINER: string;
  TIME_ZONE: string;
  EVENT_BODY: string;
  EVENT_DEFINITION: string;
  EVENT_TYPE: string;
  EXECUTE_AT: Date | null;
  INTERVAL_VALUE: string | null;
  INTERVAL_FIELD: string | null;
  SQL_MODE: string;
  STARTS: Date | null;
  ENDS: Date | null;
  STATUS: string;
  ON_COMPLETION: string;
  CREATED: Date;
  LAST_ALTERED: Date;
  LAST_EXECUTED: Date | null;
  EVENT_COMMENT: string;
  ORIGINATOR: number;
  CHARACTER_SET_CLIENT: string;
  COLLATION_CONNECTION: string;
  DATABASE_COLLATION: string;
}

export interface FILES {
  FILE_ID: number;
  FILE_NAME: string | null;
  FILE_TYPE: string;
  TABLESPACE_NAME: string | null;
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string | null;
  TABLE_NAME: string | null;
  LOGFILE_GROUP_NAME: string | null;
  LOGFILE_GROUP_NUMBER: number | null;
  ENGINE: string;
  FULLTEXT_KEYS: string | null;
  DELETED_ROWS: number | null;
  UPDATE_COUNT: number | null;
  FREE_EXTENTS: number | null;
  TOTAL_EXTENTS: number | null;
  EXTENT_SIZE: number;
  INITIAL_SIZE: number | null;
  MAXIMUM_SIZE: number | null;
  AUTOEXTEND_SIZE: number | null;
  CREATION_TIME: Date | null;
  LAST_UPDATE_TIME: Date | null;
  LAST_ACCESS_TIME: Date | null;
  RECOVER_TIME: number | null;
  TRANSACTION_COUNTER: number | null;
  VERSION: number | null;
  ROW_FORMAT: string | null;
  TABLE_ROWS: number | null;
  AVG_ROW_LENGTH: number | null;
  DATA_LENGTH: number | null;
  MAX_DATA_LENGTH: number | null;
  INDEX_LENGTH: number | null;
  DATA_FREE: number | null;
  CREATE_TIME: Date | null;
  UPDATE_TIME: Date | null;
  CHECK_TIME: Date | null;
  CHECKSUM: number | null;
  STATUS: string;
  EXTRA: string | null;
}

export interface GEOMETRYCOLUMNS {
  F_TABLE_CATALOG: string;
  F_TABLE_SCHEMA: string;
  F_TABLE_NAME: string;
  F_GEOMETRY_COLUMN: string;
  G_TABLE_CATALOG: string;
  G_TABLE_SCHEMA: string;
  G_TABLE_NAME: string;
  G_GEOMETRY_COLUMN: string;
  STORAGE_TYPE: number;
  GEOMETRY_TYPE: number;
  COORD_DIMENSION: number;
  MAX_PPR: number;
  SRID: number;
}

export interface GLOBALSTATUS {
  VARIABLE_NAME: string;
  VARIABLE_VALUE: string;
}

export interface GLOBALVARIABLES {
  VARIABLE_NAME: string;
  VARIABLE_VALUE: string;
}

export interface INDEXSTATISTICS {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  INDEX_NAME: string;
  ROWS_READ: number;
}

export interface INNODBBUFFERPAGE {
  POOL_ID: number;
  BLOCK_ID: number;
  SPACE: number;
  PAGE_NUMBER: number;
  PAGE_TYPE: string | null;
  FLUSH_TYPE: number;
  FIX_COUNT: number;
  IS_HASHED: string | null;
  NEWEST_MODIFICATION: number;
  OLDEST_MODIFICATION: number;
  ACCESS_TIME: number;
  TABLE_NAME: string | null;
  INDEX_NAME: string | null;
  NUMBER_RECORDS: number;
  DATA_SIZE: number;
  COMPRESSED_SIZE: number;
  PAGE_STATE: string | null;
  IO_FIX: string | null;
  IS_OLD: string | null;
  FREE_PAGE_CLOCK: number;
}

export interface INNODBBUFFERPAGELRU {
  POOL_ID: number;
  LRU_POSITION: number;
  SPACE: number;
  PAGE_NUMBER: number;
  PAGE_TYPE: string | null;
  FLUSH_TYPE: number;
  FIX_COUNT: number;
  IS_HASHED: string | null;
  NEWEST_MODIFICATION: number;
  OLDEST_MODIFICATION: number;
  ACCESS_TIME: number;
  TABLE_NAME: string | null;
  INDEX_NAME: string | null;
  NUMBER_RECORDS: number;
  DATA_SIZE: number;
  COMPRESSED_SIZE: number;
  COMPRESSED: string | null;
  IO_FIX: string | null;
  IS_OLD: string | null;
  FREE_PAGE_CLOCK: number;
}

export interface INNODBBUFFERPOOLSTATS {
  POOL_ID: number;
  POOL_SIZE: number;
  FREE_BUFFERS: number;
  DATABASE_PAGES: number;
  OLD_DATABASE_PAGES: number;
  MODIFIED_DATABASE_PAGES: number;
  PENDING_DECOMPRESS: number;
  PENDING_READS: number;
  PENDING_FLUSH_LRU: number;
  PENDING_FLUSH_LIST: number;
  PAGES_MADE_YOUNG: number;
  PAGES_NOT_MADE_YOUNG: number;
  PAGES_MADE_YOUNG_RATE: number;
  PAGES_MADE_NOT_YOUNG_RATE: number;
  NUMBER_PAGES_READ: number;
  NUMBER_PAGES_CREATED: number;
  NUMBER_PAGES_WRITTEN: number;
  PAGES_READ_RATE: number;
  PAGES_CREATE_RATE: number;
  PAGES_WRITTEN_RATE: number;
  NUMBER_PAGES_GET: number;
  HIT_RATE: number;
  YOUNG_MAKE_PER_THOUSAND_GETS: number;
  NOT_YOUNG_MAKE_PER_THOUSAND_GETS: number;
  NUMBER_PAGES_READ_AHEAD: number;
  NUMBER_READ_AHEAD_EVICTED: number;
  READ_AHEAD_RATE: number;
  READ_AHEAD_EVICTED_RATE: number;
  LRU_IO_TOTAL: number;
  LRU_IO_CURRENT: number;
  UNCOMPRESS_TOTAL: number;
  UNCOMPRESS_CURRENT: number;
}

export interface INNODBCMP {
  page_size: number;
  compress_ops: number;
  compress_ops_ok: number;
  compress_time: number;
  uncompress_ops: number;
  uncompress_time: number;
}

export interface INNODBCMPMEM {
  page_size: number;
  buffer_pool_instance: number;
  pages_used: number;
  pages_free: number;
  relocation_ops: number;
  relocation_time: number;
}

export interface INNODBCMPMEMRESET {
  page_size: number;
  buffer_pool_instance: number;
  pages_used: number;
  pages_free: number;
  relocation_ops: number;
  relocation_time: number;
}

export interface INNODBCMPPERINDEX {
  database_name: string;
  table_name: string;
  index_name: string;
  compress_ops: number;
  compress_ops_ok: number;
  compress_time: number;
  uncompress_ops: number;
  uncompress_time: number;
}

export interface INNODBCMPPERINDEXRESET {
  database_name: string;
  table_name: string;
  index_name: string;
  compress_ops: number;
  compress_ops_ok: number;
  compress_time: number;
  uncompress_ops: number;
  uncompress_time: number;
}

export interface INNODBCMPRESET {
  page_size: number;
  compress_ops: number;
  compress_ops_ok: number;
  compress_time: number;
  uncompress_ops: number;
  uncompress_time: number;
}

export interface INNODBFTBEINGDELETED {
  DOC_ID: number;
}

export interface INNODBFTCONFIG {
  KEY: string;
  VALUE: string;
}

export interface INNODBFTDEFAULTSTOPWORD {
  value: string;
}

export interface INNODBFTDELETED {
  DOC_ID: number;
}

export interface INNODBFTINDEXCACHE {
  WORD: string;
  FIRST_DOC_ID: number;
  LAST_DOC_ID: number;
  DOC_COUNT: number;
  DOC_ID: number;
  POSITION: number;
}

export interface INNODBFTINDEXTABLE {
  WORD: string;
  FIRST_DOC_ID: number;
  LAST_DOC_ID: number;
  DOC_COUNT: number;
  DOC_ID: number;
  POSITION: number;
}

export interface INNODBLOCKS {
  lock_id: string;
  lock_trx_id: string;
  lock_mode: string;
  lock_type: string;
  lock_table: string;
  lock_index: string | null;
  lock_space: number | null;
  lock_page: number | null;
  lock_rec: number | null;
  lock_data: string | null;
}

export interface INNODBLOCKWAITS {
  requesting_trx_id: string;
  requested_lock_id: string;
  blocking_trx_id: string;
  blocking_lock_id: string;
}

export interface INNODBMETRICS {
  NAME: string;
  SUBSYSTEM: string;
  COUNT: number;
  MAX_COUNT: number | null;
  MIN_COUNT: number | null;
  AVG_COUNT: number | null;
  COUNT_RESET: number;
  MAX_COUNT_RESET: number | null;
  MIN_COUNT_RESET: number | null;
  AVG_COUNT_RESET: number | null;
  TIME_ENABLED: Date | null;
  TIME_DISABLED: Date | null;
  TIME_ELAPSED: number | null;
  TIME_RESET: Date | null;
  STATUS: string;
  TYPE: string;
  COMMENT: string;
}

export interface INNODBMUTEXES {
  NAME: string;
  CREATE_FILE: string;
  CREATE_LINE: number;
  OS_WAITS: number;
}

export interface INNODBSYSCOLUMNS {
  TABLE_ID: number;
  NAME: string;
  POS: number;
  MTYPE: number;
  PRTYPE: number;
  LEN: number;
}

export interface INNODBSYSDATAFILES {
  SPACE: number;
  PATH: string;
}

export interface INNODBSYSFIELDS {
  INDEX_ID: number;
  NAME: string;
  POS: number;
}

export interface INNODBSYSFOREIGN {
  ID: string;
  FOR_NAME: string;
  REF_NAME: string;
  N_COLS: number;
  TYPE: number;
}

export interface INNODBSYSFOREIGNCOLS {
  ID: string;
  FOR_COL_NAME: string;
  REF_COL_NAME: string;
  POS: number;
}

export interface INNODBSYSINDEXES {
  INDEX_ID: number;
  NAME: string;
  TABLE_ID: number;
  TYPE: number;
  N_FIELDS: number;
  PAGE_NO: number;
  SPACE: number;
  MERGE_THRESHOLD: number;
}

export interface INNODBSYSSEMAPHOREWAITS {
  THREAD_ID: number;
  OBJECT_NAME: string | null;
  FILE: string | null;
  LINE: number;
  WAIT_TIME: number;
  WAIT_OBJECT: number;
  WAIT_TYPE: string | null;
  HOLDER_THREAD_ID: number;
  HOLDER_FILE: string | null;
  HOLDER_LINE: number;
  CREATED_FILE: string | null;
  CREATED_LINE: number;
  WRITER_THREAD: number;
  RESERVATION_MODE: string | null;
  READERS: number;
  WAITERS_FLAG: number;
  LOCK_WORD: number;
  LAST_WRITER_FILE: string | null;
  LAST_WRITER_LINE: number;
  OS_WAIT_COUNT: number;
}

export interface INNODBSYSTABLES {
  TABLE_ID: number;
  NAME: string;
  FLAG: number;
  N_COLS: number;
  SPACE: number;
  ROW_FORMAT: string | null;
  ZIP_PAGE_SIZE: number;
  SPACE_TYPE: string | null;
}

export interface INNODBSYSTABLESPACES {
  SPACE: number;
  NAME: string;
  FLAG: number;
  ROW_FORMAT: string | null;
  PAGE_SIZE: number;
  ZIP_PAGE_SIZE: number;
  SPACE_TYPE: string | null;
  FS_BLOCK_SIZE: number;
  FILE_SIZE: number;
  ALLOCATED_SIZE: number;
}

export interface INNODBSYSTABLESTATS {
  TABLE_ID: number;
  NAME: string;
  STATS_INITIALIZED: string;
  NUM_ROWS: number;
  CLUST_INDEX_SIZE: number;
  OTHER_INDEX_SIZE: number;
  MODIFIED_COUNTER: number;
  AUTOINC: number;
  REF_COUNT: number;
}

export interface INNODBSYSVIRTUAL {
  TABLE_ID: number;
  POS: number;
  BASE_POS: number;
}

export interface INNODBTABLESPACESENCRYPTION {
  SPACE: number;
  NAME: string | null;
  ENCRYPTION_SCHEME: number;
  KEYSERVER_REQUESTS: number;
  MIN_KEY_VERSION: number;
  CURRENT_KEY_VERSION: number;
  KEY_ROTATION_PAGE_NUMBER: number | null;
  KEY_ROTATION_MAX_PAGE_NUMBER: number | null;
  CURRENT_KEY_ID: number;
  ROTATING_OR_FLUSHING: number;
}

export interface INNODBTABLESPACESSCRUBBING {
  SPACE: number;
  NAME: string | null;
  COMPRESSED: number;
  LAST_SCRUB_COMPLETED: Date | null;
  CURRENT_SCRUB_STARTED: Date | null;
  CURRENT_SCRUB_ACTIVE_THREADS: number | null;
  CURRENT_SCRUB_PAGE_NUMBER: number;
  CURRENT_SCRUB_MAX_PAGE_NUMBER: number;
}

export interface INNODBTRX {
  trx_id: string;
  trx_state: string;
  trx_started: Date;
  trx_requested_lock_id: string | null;
  trx_wait_started: Date | null;
  trx_weight: number;
  trx_mysql_thread_id: number;
  trx_query: string | null;
  trx_operation_state: string | null;
  trx_tables_in_use: number;
  trx_tables_locked: number;
  trx_lock_structs: number;
  trx_lock_memory_bytes: number;
  trx_rows_locked: number;
  trx_rows_modified: number;
  trx_concurrency_tickets: number;
  trx_isolation_level: string;
  trx_unique_checks: number;
  trx_foreign_key_checks: number;
  trx_last_foreign_key_error: string | null;
  trx_is_read_only: number;
  trx_autocommit_non_locking: number;
}

export interface KEYCACHES {
  KEY_CACHE_NAME: string;
  SEGMENTS: number | null;
  SEGMENT_NUMBER: number | null;
  FULL_SIZE: number;
  BLOCK_SIZE: number;
  USED_BLOCKS: number;
  UNUSED_BLOCKS: number;
  DIRTY_BLOCKS: number;
  READ_REQUESTS: number;
  READS: number;
  WRITE_REQUESTS: number;
  WRITES: number;
}

export interface KEYCOLUMNUSAGE {
  CONSTRAINT_CATALOG: string;
  CONSTRAINT_SCHEMA: string;
  CONSTRAINT_NAME: string;
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  ORDINAL_POSITION: number;
  POSITION_IN_UNIQUE_CONSTRAINT: number | null;
  REFERENCED_TABLE_SCHEMA: string | null;
  REFERENCED_TABLE_NAME: string | null;
  REFERENCED_COLUMN_NAME: string | null;
}

export interface KEYWORDS {
  WORD: string | null;
}

export interface PARAMETERS {
  SPECIFIC_CATALOG: string;
  SPECIFIC_SCHEMA: string;
  SPECIFIC_NAME: string;
  ORDINAL_POSITION: number;
  PARAMETER_MODE: string | null;
  PARAMETER_NAME: string | null;
  DATA_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
  CHARACTER_OCTET_LENGTH: number | null;
  NUMERIC_PRECISION: number | null;
  NUMERIC_SCALE: number | null;
  DATETIME_PRECISION: number | null;
  CHARACTER_SET_NAME: string | null;
  COLLATION_NAME: string | null;
  DTD_IDENTIFIER: string;
  ROUTINE_TYPE: string;
}

export interface PARTITIONS {
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  PARTITION_NAME: string | null;
  SUBPARTITION_NAME: string | null;
  PARTITION_ORDINAL_POSITION: number | null;
  SUBPARTITION_ORDINAL_POSITION: number | null;
  PARTITION_METHOD: string | null;
  SUBPARTITION_METHOD: string | null;
  PARTITION_EXPRESSION: string | null;
  SUBPARTITION_EXPRESSION: string | null;
  PARTITION_DESCRIPTION: string | null;
  TABLE_ROWS: number;
  AVG_ROW_LENGTH: number;
  DATA_LENGTH: number;
  MAX_DATA_LENGTH: number | null;
  INDEX_LENGTH: number;
  DATA_FREE: number;
  CREATE_TIME: Date | null;
  UPDATE_TIME: Date | null;
  CHECK_TIME: Date | null;
  CHECKSUM: number | null;
  PARTITION_COMMENT: string;
  NODEGROUP: string;
  TABLESPACE_NAME: string | null;
}

export interface PLUGINS {
  PLUGIN_NAME: string;
  PLUGIN_VERSION: string;
  PLUGIN_STATUS: string;
  PLUGIN_TYPE: string;
  PLUGIN_TYPE_VERSION: string;
  PLUGIN_LIBRARY: string | null;
  PLUGIN_LIBRARY_VERSION: string | null;
  PLUGIN_AUTHOR: string | null;
  PLUGIN_DESCRIPTION: string | null;
  PLUGIN_LICENSE: string;
  LOAD_OPTION: string;
  PLUGIN_MATURITY: string;
  PLUGIN_AUTH_VERSION: string | null;
}

export interface PROCESSLIST {
  ID: number;
  USER: string;
  HOST: string;
  DB: string | null;
  COMMAND: string;
  TIME: number;
  STATE: string | null;
  INFO: string | null;
  TIME_MS: Decimal;
  STAGE: number;
  MAX_STAGE: number;
  PROGRESS: Decimal;
  MEMORY_USED: number;
  MAX_MEMORY_USED: number;
  EXAMINED_ROWS: number;
  QUERY_ID: number;
  INFO_BINARY: Buffer | null;
  TID: number;
}

export interface PROFILING {
  QUERY_ID: number;
  SEQ: number;
  STATE: string;
  DURATION: Decimal;
  CPU_USER: Decimal | null;
  CPU_SYSTEM: Decimal | null;
  CONTEXT_VOLUNTARY: number | null;
  CONTEXT_INVOLUNTARY: number | null;
  BLOCK_OPS_IN: number | null;
  BLOCK_OPS_OUT: number | null;
  MESSAGES_SENT: number | null;
  MESSAGES_RECEIVED: number | null;
  PAGE_FAULTS_MAJOR: number | null;
  PAGE_FAULTS_MINOR: number | null;
  SWAPS: number | null;
  SOURCE_FUNCTION: string | null;
  SOURCE_FILE: string | null;
  SOURCE_LINE: number | null;
}

export interface REFERENTIALCONSTRAINTS {
  CONSTRAINT_CATALOG: string;
  CONSTRAINT_SCHEMA: string;
  CONSTRAINT_NAME: string;
  UNIQUE_CONSTRAINT_CATALOG: string;
  UNIQUE_CONSTRAINT_SCHEMA: string;
  UNIQUE_CONSTRAINT_NAME: string | null;
  MATCH_OPTION: string;
  UPDATE_RULE: string;
  DELETE_RULE: string;
  TABLE_NAME: string;
  REFERENCED_TABLE_NAME: string;
}

export interface ROUTINES {
  SPECIFIC_NAME: string;
  ROUTINE_CATALOG: string;
  ROUTINE_SCHEMA: string;
  ROUTINE_NAME: string;
  ROUTINE_TYPE: string;
  DATA_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
  CHARACTER_OCTET_LENGTH: number | null;
  NUMERIC_PRECISION: number | null;
  NUMERIC_SCALE: number | null;
  DATETIME_PRECISION: number | null;
  CHARACTER_SET_NAME: string | null;
  COLLATION_NAME: string | null;
  DTD_IDENTIFIER: string | null;
  ROUTINE_BODY: string;
  ROUTINE_DEFINITION: string | null;
  EXTERNAL_NAME: string | null;
  EXTERNAL_LANGUAGE: string | null;
  PARAMETER_STYLE: string;
  IS_DETERMINISTIC: string;
  SQL_DATA_ACCESS: string;
  SQL_PATH: string | null;
  SECURITY_TYPE: string;
  CREATED: Date;
  LAST_ALTERED: Date;
  SQL_MODE: string;
  ROUTINE_COMMENT: string;
  DEFINER: string;
  CHARACTER_SET_CLIENT: string;
  COLLATION_CONNECTION: string;
  DATABASE_COLLATION: string;
}

export interface SCHEMAPRIVILEGES {
  GRANTEE: string;
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string;
  PRIVILEGE_TYPE: string;
  IS_GRANTABLE: string;
}

export interface SCHEMATA {
  CATALOG_NAME: string;
  SCHEMA_NAME: string;
  DEFAULT_CHARACTER_SET_NAME: string;
  DEFAULT_COLLATION_NAME: string;
  SQL_PATH: string | null;
}

export interface SESSIONSTATUS {
  VARIABLE_NAME: string;
  VARIABLE_VALUE: string;
}

export interface SESSIONVARIABLES {
  VARIABLE_NAME: string;
  VARIABLE_VALUE: string;
}

export interface SPATIALREFSYS {
  SRID: number;
  AUTH_NAME: string;
  AUTH_SRID: number;
  SRTEXT: string;
}

export interface SQLFUNCTIONS {
  FUNCTION: string | null;
}

export interface STATISTICS {
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  NON_UNIQUE: number;
  INDEX_SCHEMA: string;
  INDEX_NAME: string;
  SEQ_IN_INDEX: number;
  COLUMN_NAME: string;
  COLLATION: string | null;
  CARDINALITY: number | null;
  SUB_PART: number | null;
  PACKED: string | null;
  NULLABLE: string;
  INDEX_TYPE: string;
  COMMENT: string | null;
  INDEX_COMMENT: string;
}

export interface SYSTEMVARIABLES {
  VARIABLE_NAME: string;
  SESSION_VALUE: string | null;
  GLOBAL_VALUE: string | null;
  GLOBAL_VALUE_ORIGIN: string;
  DEFAULT_VALUE: string | null;
  VARIABLE_SCOPE: string;
  VARIABLE_TYPE: string;
  VARIABLE_COMMENT: string;
  NUMERIC_MIN_VALUE: string | null;
  NUMERIC_MAX_VALUE: string | null;
  NUMERIC_BLOCK_SIZE: string | null;
  ENUM_VALUE_LIST: string | null;
  READ_ONLY: string;
  COMMAND_LINE_ARGUMENT: string | null;
}

export interface TABLECONSTRAINTS {
  CONSTRAINT_CATALOG: string;
  CONSTRAINT_SCHEMA: string;
  CONSTRAINT_NAME: string;
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  CONSTRAINT_TYPE: string;
}

export interface TABLEPRIVILEGES {
  GRANTEE: string;
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  PRIVILEGE_TYPE: string;
  IS_GRANTABLE: string;
}

export interface TABLES {
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  TABLE_TYPE: string;
  ENGINE: string | null;
  VERSION: number | null;
  ROW_FORMAT: string | null;
  TABLE_ROWS: number | null;
  AVG_ROW_LENGTH: number | null;
  DATA_LENGTH: number | null;
  MAX_DATA_LENGTH: number | null;
  INDEX_LENGTH: number | null;
  DATA_FREE: number | null;
  AUTO_INCREMENT: number | null;
  CREATE_TIME: Date | null;
  UPDATE_TIME: Date | null;
  CHECK_TIME: Date | null;
  TABLE_COLLATION: string | null;
  CHECKSUM: number | null;
  CREATE_OPTIONS: string | null;
  TABLE_COMMENT: string;
  MAX_INDEX_LENGTH: number | null;
  TEMPORARY: string | null;
}

export interface TABLESPACES {
  TABLESPACE_NAME: string;
  ENGINE: string;
  TABLESPACE_TYPE: string | null;
  LOGFILE_GROUP_NAME: string | null;
  EXTENT_SIZE: number | null;
  AUTOEXTEND_SIZE: number | null;
  MAXIMUM_SIZE: number | null;
  NODEGROUP_ID: number | null;
  TABLESPACE_COMMENT: string | null;
}

export interface TABLESTATISTICS {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  ROWS_READ: number;
  ROWS_CHANGED: number;
  ROWS_CHANGED_X_INDEXES: number;
}

export interface TRIGGERS {
  TRIGGER_CATALOG: string;
  TRIGGER_SCHEMA: string;
  TRIGGER_NAME: string;
  EVENT_MANIPULATION: string;
  EVENT_OBJECT_CATALOG: string;
  EVENT_OBJECT_SCHEMA: string;
  EVENT_OBJECT_TABLE: string;
  ACTION_ORDER: number;
  ACTION_CONDITION: string | null;
  ACTION_STATEMENT: string;
  ACTION_ORIENTATION: string;
  ACTION_TIMING: string;
  ACTION_REFERENCE_OLD_TABLE: string | null;
  ACTION_REFERENCE_NEW_TABLE: string | null;
  ACTION_REFERENCE_OLD_ROW: string;
  ACTION_REFERENCE_NEW_ROW: string;
  CREATED: Date | null;
  SQL_MODE: string;
  DEFINER: string;
  CHARACTER_SET_CLIENT: string;
  COLLATION_CONNECTION: string;
  DATABASE_COLLATION: string;
}

export interface USERPRIVILEGES {
  GRANTEE: string;
  TABLE_CATALOG: string;
  PRIVILEGE_TYPE: string;
  IS_GRANTABLE: string;
}

export interface USERSTATISTICS {
  USER: string;
  TOTAL_CONNECTIONS: number;
  CONCURRENT_CONNECTIONS: number;
  CONNECTED_TIME: number;
  BUSY_TIME: number;
  CPU_TIME: number;
  BYTES_RECEIVED: number;
  BYTES_SENT: number;
  BINLOG_BYTES_WRITTEN: number;
  ROWS_READ: number;
  ROWS_SENT: number;
  ROWS_DELETED: number;
  ROWS_INSERTED: number;
  ROWS_UPDATED: number;
  SELECT_COMMANDS: number;
  UPDATE_COMMANDS: number;
  OTHER_COMMANDS: number;
  COMMIT_TRANSACTIONS: number;
  ROLLBACK_TRANSACTIONS: number;
  DENIED_CONNECTIONS: number;
  LOST_CONNECTIONS: number;
  ACCESS_DENIED: number;
  EMPTY_QUERIES: number;
  TOTAL_SSL_CONNECTIONS: number;
  MAX_STATEMENT_TIME_EXCEEDED: number;
}

export interface UserVariables {
  VARIABLE_NAME: string;
  VARIABLE_VALUE: string | null;
  VARIABLE_TYPE: string;
  CHARACTER_SET_NAME: string | null;
}

export interface VIEWS {
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  VIEW_DEFINITION: string;
  CHECK_OPTION: string;
  IS_UPDATABLE: string;
  DEFINER: string;
  SECURITY_TYPE: string;
  CHARACTER_SET_CLIENT: string;
  COLLATION_CONNECTION: string;
  ALGORITHM: string;
}

export interface InfoSchemaDB {
  ALL_PLUGINS: ALLPLUGINS;
  APPLICABLE_ROLES: APPLICABLEROLES;
  CHARACTER_SETS: CHARACTERSETS;
  CHECK_CONSTRAINTS: CHECKCONSTRAINTS;
  CLIENT_STATISTICS: CLIENTSTATISTICS;
  COLLATION_CHARACTER_SET_APPLICABILITY: COLLATIONCHARACTERSETAPPLICABILITY;
  COLLATIONS: COLLATIONS;
  COLUMN_PRIVILEGES: COLUMNPRIVILEGES;
  COLUMNS: COLUMNS;
  ENABLED_ROLES: ENABLEDROLES;
  ENGINES: ENGINES;
  EVENTS: EVENTS;
  FILES: FILES;
  GEOMETRY_COLUMNS: GEOMETRYCOLUMNS;
  GLOBAL_STATUS: GLOBALSTATUS;
  GLOBAL_VARIABLES: GLOBALVARIABLES;
  INDEX_STATISTICS: INDEXSTATISTICS;
  INNODB_BUFFER_PAGE: INNODBBUFFERPAGE;
  INNODB_BUFFER_PAGE_LRU: INNODBBUFFERPAGELRU;
  INNODB_BUFFER_POOL_STATS: INNODBBUFFERPOOLSTATS;
  INNODB_CMP: INNODBCMP;
  INNODB_CMP_PER_INDEX: INNODBCMPPERINDEX;
  INNODB_CMP_PER_INDEX_RESET: INNODBCMPPERINDEXRESET;
  INNODB_CMP_RESET: INNODBCMPRESET;
  INNODB_CMPMEM: INNODBCMPMEM;
  INNODB_CMPMEM_RESET: INNODBCMPMEMRESET;
  INNODB_FT_BEING_DELETED: INNODBFTBEINGDELETED;
  INNODB_FT_CONFIG: INNODBFTCONFIG;
  INNODB_FT_DEFAULT_STOPWORD: INNODBFTDEFAULTSTOPWORD;
  INNODB_FT_DELETED: INNODBFTDELETED;
  INNODB_FT_INDEX_CACHE: INNODBFTINDEXCACHE;
  INNODB_FT_INDEX_TABLE: INNODBFTINDEXTABLE;
  INNODB_LOCK_WAITS: INNODBLOCKWAITS;
  INNODB_LOCKS: INNODBLOCKS;
  INNODB_METRICS: INNODBMETRICS;
  INNODB_MUTEXES: INNODBMUTEXES;
  INNODB_SYS_COLUMNS: INNODBSYSCOLUMNS;
  INNODB_SYS_DATAFILES: INNODBSYSDATAFILES;
  INNODB_SYS_FIELDS: INNODBSYSFIELDS;
  INNODB_SYS_FOREIGN: INNODBSYSFOREIGN;
  INNODB_SYS_FOREIGN_COLS: INNODBSYSFOREIGNCOLS;
  INNODB_SYS_INDEXES: INNODBSYSINDEXES;
  INNODB_SYS_SEMAPHORE_WAITS: INNODBSYSSEMAPHOREWAITS;
  INNODB_SYS_TABLES: INNODBSYSTABLES;
  INNODB_SYS_TABLESPACES: INNODBSYSTABLESPACES;
  INNODB_SYS_TABLESTATS: INNODBSYSTABLESTATS;
  INNODB_SYS_VIRTUAL: INNODBSYSVIRTUAL;
  INNODB_TABLESPACES_ENCRYPTION: INNODBTABLESPACESENCRYPTION;
  INNODB_TABLESPACES_SCRUBBING: INNODBTABLESPACESSCRUBBING;
  INNODB_TRX: INNODBTRX;
  KEY_CACHES: KEYCACHES;
  KEY_COLUMN_USAGE: KEYCOLUMNUSAGE;
  KEYWORDS: KEYWORDS;
  PARAMETERS: PARAMETERS;
  PARTITIONS: PARTITIONS;
  PLUGINS: PLUGINS;
  PROCESSLIST: PROCESSLIST;
  PROFILING: PROFILING;
  REFERENTIAL_CONSTRAINTS: REFERENTIALCONSTRAINTS;
  ROUTINES: ROUTINES;
  SCHEMA_PRIVILEGES: SCHEMAPRIVILEGES;
  SCHEMATA: SCHEMATA;
  SESSION_STATUS: SESSIONSTATUS;
  SESSION_VARIABLES: SESSIONVARIABLES;
  SPATIAL_REF_SYS: SPATIALREFSYS;
  SQL_FUNCTIONS: SQLFUNCTIONS;
  STATISTICS: STATISTICS;
  SYSTEM_VARIABLES: SYSTEMVARIABLES;
  TABLE_CONSTRAINTS: TABLECONSTRAINTS;
  TABLE_PRIVILEGES: TABLEPRIVILEGES;
  TABLE_STATISTICS: TABLESTATISTICS;
  TABLES: TABLES;
  TABLESPACES: TABLESPACES;
  TRIGGERS: TRIGGERS;
  USER_PRIVILEGES: USERPRIVILEGES;
  USER_STATISTICS: USERSTATISTICS;
  user_variables: UserVariables;
  VIEWS: VIEWS;
}
