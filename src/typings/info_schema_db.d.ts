import type { ColumnType } from "kysely";

export type Decimal = ColumnType<string, number | string, number | string>;

export interface ALLPLUGINS {
    LOAD_OPTION: string;
    PLUGIN_AUTH_VERSION: string | null;
    PLUGIN_AUTHOR: string | null;
    PLUGIN_DESCRIPTION: string | null;
    PLUGIN_LIBRARY: string | null;
    PLUGIN_LIBRARY_VERSION: string | null;
    PLUGIN_LICENSE: string;
    PLUGIN_MATURITY: string;
    PLUGIN_NAME: string;
    PLUGIN_STATUS: string;
    PLUGIN_TYPE: string;
    PLUGIN_TYPE_VERSION: string;
    PLUGIN_VERSION: string;
}

export interface APPLICABLEROLES {
    GRANTEE: string;
    IS_DEFAULT: string | null;
    IS_GRANTABLE: string;
    ROLE_NAME: string;
}

export interface CHARACTERSETS {
    CHARACTER_SET_NAME: string;
    DEFAULT_COLLATE_NAME: string;
    DESCRIPTION: string;
    MAXLEN: number;
}

export interface CHECKCONSTRAINTS {
    CHECK_CLAUSE: string;
    CONSTRAINT_CATALOG: string;
    CONSTRAINT_NAME: string;
    CONSTRAINT_SCHEMA: string;
    LEVEL: string;
    TABLE_NAME: string;
}

export interface CLIENTSTATISTICS {
    ACCESS_DENIED: number;
    BINLOG_BYTES_WRITTEN: number;
    BUSY_TIME: number;
    BYTES_RECEIVED: number;
    BYTES_SENT: number;
    CLIENT: string;
    COMMIT_TRANSACTIONS: number;
    CONCURRENT_CONNECTIONS: number;
    CONNECTED_TIME: number;
    CPU_TIME: number;
    DENIED_CONNECTIONS: number;
    EMPTY_QUERIES: number;
    LOST_CONNECTIONS: number;
    MAX_STATEMENT_TIME_EXCEEDED: number;
    OTHER_COMMANDS: number;
    ROLLBACK_TRANSACTIONS: number;
    ROWS_DELETED: number;
    ROWS_INSERTED: number;
    ROWS_READ: number;
    ROWS_SENT: number;
    ROWS_UPDATED: number;
    SELECT_COMMANDS: number;
    TOTAL_CONNECTIONS: number;
    TOTAL_SSL_CONNECTIONS: number;
    UPDATE_COMMANDS: number;
}

export interface COLLATIONCHARACTERSETAPPLICABILITY {
    CHARACTER_SET_NAME: string;
    COLLATION_NAME: string;
    FULL_COLLATION_NAME: string;
    ID: number;
    IS_DEFAULT: string;
}

export interface COLLATIONS {
    CHARACTER_SET_NAME: string | null;
    COLLATION_NAME: string;
    ID: number | null;
    IS_COMPILED: string;
    IS_DEFAULT: string | null;
    SORTLEN: number;
}

export interface COLUMNPRIVILEGES {
    COLUMN_NAME: string;
    GRANTEE: string;
    IS_GRANTABLE: string;
    PRIVILEGE_TYPE: string;
    TABLE_CATALOG: string;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
}

export interface COLUMNS {
    CHARACTER_MAXIMUM_LENGTH: number | null;
    CHARACTER_OCTET_LENGTH: number | null;
    CHARACTER_SET_NAME: string | null;
    COLLATION_NAME: string | null;
    COLUMN_COMMENT: string;
    COLUMN_DEFAULT: string | null;
    COLUMN_KEY: string;
    COLUMN_NAME: string;
    COLUMN_TYPE: string;
    DATA_TYPE: string;
    DATETIME_PRECISION: number | null;
    EXTRA: string;
    GENERATION_EXPRESSION: string | null;
    IS_GENERATED: string;
    IS_NULLABLE: string;
    NUMERIC_PRECISION: number | null;
    NUMERIC_SCALE: number | null;
    ORDINAL_POSITION: number;
    PRIVILEGES: string;
    TABLE_CATALOG: string;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
}

export interface ENABLEDROLES {
    ROLE_NAME: string | null;
}

export interface ENGINES {
    COMMENT: string;
    ENGINE: string;
    SAVEPOINTS: string | null;
    SUPPORT: string;
    TRANSACTIONS: string | null;
    XA: string | null;
}

export interface EVENTS {
    CHARACTER_SET_CLIENT: string;
    COLLATION_CONNECTION: string;
    CREATED: Date;
    DATABASE_COLLATION: string;
    DEFINER: string;
    ENDS: Date | null;
    EVENT_BODY: string;
    EVENT_CATALOG: string;
    EVENT_COMMENT: string;
    EVENT_DEFINITION: string;
    EVENT_NAME: string;
    EVENT_SCHEMA: string;
    EVENT_TYPE: string;
    EXECUTE_AT: Date | null;
    INTERVAL_FIELD: string | null;
    INTERVAL_VALUE: string | null;
    LAST_ALTERED: Date;
    LAST_EXECUTED: Date | null;
    ON_COMPLETION: string;
    ORIGINATOR: number;
    SQL_MODE: string;
    STARTS: Date | null;
    STATUS: string;
    TIME_ZONE: string;
}

export interface FILES {
    AUTOEXTEND_SIZE: number | null;
    AVG_ROW_LENGTH: number | null;
    CHECK_TIME: Date | null;
    CHECKSUM: number | null;
    CREATE_TIME: Date | null;
    CREATION_TIME: Date | null;
    DATA_FREE: number | null;
    DATA_LENGTH: number | null;
    DELETED_ROWS: number | null;
    ENGINE: string;
    EXTENT_SIZE: number;
    EXTRA: string | null;
    FILE_ID: number;
    FILE_NAME: string | null;
    FILE_TYPE: string;
    FREE_EXTENTS: number | null;
    FULLTEXT_KEYS: string | null;
    INDEX_LENGTH: number | null;
    INITIAL_SIZE: number | null;
    LAST_ACCESS_TIME: Date | null;
    LAST_UPDATE_TIME: Date | null;
    LOGFILE_GROUP_NAME: string | null;
    LOGFILE_GROUP_NUMBER: number | null;
    MAX_DATA_LENGTH: number | null;
    MAXIMUM_SIZE: number | null;
    RECOVER_TIME: number | null;
    ROW_FORMAT: string | null;
    STATUS: string;
    TABLE_CATALOG: string;
    TABLE_NAME: string | null;
    TABLE_ROWS: number | null;
    TABLE_SCHEMA: string | null;
    TABLESPACE_NAME: string | null;
    TOTAL_EXTENTS: number | null;
    TRANSACTION_COUNTER: number | null;
    UPDATE_COUNT: number | null;
    UPDATE_TIME: Date | null;
    VERSION: number | null;
}

export interface GEOMETRYCOLUMNS {
    COORD_DIMENSION: number;
    F_GEOMETRY_COLUMN: string;
    F_TABLE_CATALOG: string;
    F_TABLE_NAME: string;
    F_TABLE_SCHEMA: string;
    G_GEOMETRY_COLUMN: string;
    G_TABLE_CATALOG: string;
    G_TABLE_NAME: string;
    G_TABLE_SCHEMA: string;
    GEOMETRY_TYPE: number;
    MAX_PPR: number;
    SRID: number;
    STORAGE_TYPE: number;
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
    INDEX_NAME: string;
    ROWS_READ: number;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
}

export interface INNODBBUFFERPAGE {
    ACCESS_TIME: number;
    BLOCK_ID: number;
    COMPRESSED_SIZE: number;
    DATA_SIZE: number;
    FIX_COUNT: number;
    FLUSH_TYPE: number;
    FREE_PAGE_CLOCK: number;
    INDEX_NAME: string | null;
    IO_FIX: "IO_NONE" | "IO_READ" | "IO_WRITE";
    IS_HASHED: number;
    IS_OLD: number;
    NEWEST_MODIFICATION: number;
    NUMBER_RECORDS: number;
    OLDEST_MODIFICATION: number;
    PAGE_NUMBER: number;
    PAGE_STATE: "FILE_PAGE" | "MEMORY" | "NOT_USED" | "REMOVE_HASH";
    PAGE_TYPE: string | null;
    POOL_ID: number;
    SPACE: number;
    TABLE_NAME: string | null;
}

export interface INNODBBUFFERPAGELRU {
    ACCESS_TIME: number;
    COMPRESSED: number;
    COMPRESSED_SIZE: number;
    DATA_SIZE: number;
    FIX_COUNT: number;
    FLUSH_TYPE: number;
    FREE_PAGE_CLOCK: number;
    INDEX_NAME: string | null;
    IO_FIX: "IO_NONE" | "IO_READ" | "IO_WRITE";
    IS_HASHED: number;
    IS_OLD: number | null;
    LRU_POSITION: number;
    NEWEST_MODIFICATION: number;
    NUMBER_RECORDS: number;
    OLDEST_MODIFICATION: number;
    PAGE_NUMBER: number;
    PAGE_TYPE: string | null;
    POOL_ID: number;
    SPACE: number;
    TABLE_NAME: string | null;
}

export interface INNODBBUFFERPOOLSTATS {
    DATABASE_PAGES: number;
    FREE_BUFFERS: number;
    HIT_RATE: number;
    LRU_IO_CURRENT: number;
    LRU_IO_TOTAL: number;
    MODIFIED_DATABASE_PAGES: number;
    NOT_YOUNG_MAKE_PER_THOUSAND_GETS: number;
    NUMBER_PAGES_CREATED: number;
    NUMBER_PAGES_GET: number;
    NUMBER_PAGES_READ: number;
    NUMBER_PAGES_READ_AHEAD: number;
    NUMBER_PAGES_WRITTEN: number;
    NUMBER_READ_AHEAD_EVICTED: number;
    OLD_DATABASE_PAGES: number;
    PAGES_CREATE_RATE: number;
    PAGES_MADE_NOT_YOUNG_RATE: number;
    PAGES_MADE_YOUNG: number;
    PAGES_MADE_YOUNG_RATE: number;
    PAGES_NOT_MADE_YOUNG: number;
    PAGES_READ_RATE: number;
    PAGES_WRITTEN_RATE: number;
    PENDING_DECOMPRESS: number;
    PENDING_FLUSH_LIST: number;
    PENDING_FLUSH_LRU: number;
    PENDING_READS: number;
    POOL_ID: number;
    POOL_SIZE: number;
    READ_AHEAD_EVICTED_RATE: number;
    READ_AHEAD_RATE: number;
    UNCOMPRESS_CURRENT: number;
    UNCOMPRESS_TOTAL: number;
    YOUNG_MAKE_PER_THOUSAND_GETS: number;
}

export interface INNODBCMP {
    compress_ops: number;
    compress_ops_ok: number;
    compress_time: number;
    page_size: number;
    uncompress_ops: number;
    uncompress_time: number;
}

export interface INNODBCMPMEM {
    buffer_pool_instance: number;
    page_size: number;
    pages_free: number;
    pages_used: number;
    relocation_ops: number;
    relocation_time: number;
}

export interface INNODBCMPMEMRESET {
    buffer_pool_instance: number;
    page_size: number;
    pages_free: number;
    pages_used: number;
    relocation_ops: number;
    relocation_time: number;
}

export interface INNODBCMPPERINDEX {
    compress_ops: number;
    compress_ops_ok: number;
    compress_time: number;
    database_name: string;
    index_name: string;
    table_name: string;
    uncompress_ops: number;
    uncompress_time: number;
}

export interface INNODBCMPPERINDEXRESET {
    compress_ops: number;
    compress_ops_ok: number;
    compress_time: number;
    database_name: string;
    index_name: string;
    table_name: string;
    uncompress_ops: number;
    uncompress_time: number;
}

export interface INNODBCMPRESET {
    compress_ops: number;
    compress_ops_ok: number;
    compress_time: number;
    page_size: number;
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
    DOC_COUNT: number;
    DOC_ID: number;
    FIRST_DOC_ID: number;
    LAST_DOC_ID: number;
    POSITION: number;
    WORD: string;
}

export interface INNODBFTINDEXTABLE {
    DOC_COUNT: number;
    DOC_ID: number;
    FIRST_DOC_ID: number;
    LAST_DOC_ID: number;
    POSITION: number;
    WORD: string;
}

export interface INNODBLOCKS {
    lock_data: string | null;
    lock_id: string;
    lock_index: string | null;
    lock_mode:
        | "AUTO_INC"
        | "IS"
        | "IS,GAP"
        | "IX"
        | "IX,GAP"
        | "S"
        | "S,GAP"
        | "X"
        | "X,GAP";
    lock_page: number | null;
    lock_rec: number | null;
    lock_space: number | null;
    lock_table: string;
    lock_trx_id: number;
    lock_type: "RECORD" | "TABLE";
}

export interface INNODBLOCKWAITS {
    blocking_lock_id: string;
    blocking_trx_id: number;
    requested_lock_id: string;
    requesting_trx_id: number;
}

export interface INNODBMETRICS {
    AVG_COUNT: number | null;
    AVG_COUNT_RESET: number | null;
    COMMENT: string;
    COUNT: number;
    COUNT_RESET: number;
    ENABLED: number;
    MAX_COUNT: number | null;
    MAX_COUNT_RESET: number | null;
    MIN_COUNT: number | null;
    MIN_COUNT_RESET: number | null;
    NAME: string;
    SUBSYSTEM: string;
    TIME_DISABLED: Date | null;
    TIME_ELAPSED: number | null;
    TIME_ENABLED: Date | null;
    TIME_RESET: Date | null;
    TYPE: "counter" | "set_member" | "set_owner" | "status_counter" | "value";
}

export interface INNODBSYSCOLUMNS {
    LEN: number;
    MTYPE: number;
    NAME: string;
    POS: number;
    PRTYPE: number;
    TABLE_ID: number;
}

export interface INNODBSYSFIELDS {
    INDEX_ID: number;
    NAME: string;
    POS: number;
}

export interface INNODBSYSFOREIGN {
    FOR_NAME: string;
    ID: string;
    N_COLS: number;
    REF_NAME: string;
    TYPE: number;
}

export interface INNODBSYSFOREIGNCOLS {
    FOR_COL_NAME: string;
    ID: string;
    POS: number;
    REF_COL_NAME: string;
}

export interface INNODBSYSINDEXES {
    INDEX_ID: number;
    MERGE_THRESHOLD: number;
    N_FIELDS: number;
    NAME: string;
    PAGE_NO: number | null;
    SPACE: number | null;
    TABLE_ID: number;
    TYPE: number;
}

export interface INNODBSYSTABLES {
    FLAG: number;
    N_COLS: number;
    NAME: string;
    ROW_FORMAT: "Compact" | "Compressed" | "Dynamic" | "Redundant" | null;
    SPACE: number;
    SPACE_TYPE: "Single" | "System" | null;
    TABLE_ID: number;
    ZIP_PAGE_SIZE: number;
}

export interface INNODBSYSTABLESPACES {
    ALLOCATED_SIZE: number;
    FILE_SIZE: number;
    FILENAME: string;
    FLAG: number;
    FS_BLOCK_SIZE: number;
    NAME: string;
    PAGE_SIZE: number;
    ROW_FORMAT: string | null;
    SPACE: number;
}

export interface INNODBSYSTABLESTATS {
    AUTOINC: number;
    CLUST_INDEX_SIZE: number;
    MODIFIED_COUNTER: number;
    NAME: string;
    NUM_ROWS: number;
    OTHER_INDEX_SIZE: number;
    REF_COUNT: number;
    STATS_INITIALIZED: number;
    TABLE_ID: number;
}

export interface INNODBSYSVIRTUAL {
    BASE_POS: number;
    POS: number;
    TABLE_ID: number;
}

export interface INNODBTABLESPACESENCRYPTION {
    CURRENT_KEY_ID: number;
    CURRENT_KEY_VERSION: number;
    ENCRYPTION_SCHEME: number;
    KEY_ROTATION_MAX_PAGE_NUMBER: number | null;
    KEY_ROTATION_PAGE_NUMBER: number | null;
    KEYSERVER_REQUESTS: number;
    MIN_KEY_VERSION: number;
    NAME: string | null;
    ROTATING_OR_FLUSHING: number;
    SPACE: number;
}

export interface INNODBTRX {
    trx_autocommit_non_locking: number;
    trx_concurrency_tickets: number;
    trx_foreign_key_checks: number;
    trx_id: number;
    trx_is_read_only: number;
    trx_isolation_level:
        | "READ COMMITTED"
        | "READ UNCOMMITTED"
        | "REPEATABLE READ"
        | "SERIALIZABLE";
    trx_last_foreign_key_error: string | null;
    trx_lock_memory_bytes: number;
    trx_lock_structs: number;
    trx_mysql_thread_id: number;
    trx_operation_state: string | null;
    trx_query: string | null;
    trx_requested_lock_id: string | null;
    trx_rows_locked: number;
    trx_rows_modified: number;
    trx_started: Date;
    trx_state: string;
    trx_tables_in_use: number;
    trx_tables_locked: number;
    trx_unique_checks: number;
    trx_wait_started: Date | null;
    trx_weight: number;
}

export interface KEYCACHES {
    BLOCK_SIZE: number;
    DIRTY_BLOCKS: number;
    FULL_SIZE: number;
    KEY_CACHE_NAME: string;
    READ_REQUESTS: number;
    READS: number;
    SEGMENT_NUMBER: number | null;
    SEGMENTS: number | null;
    UNUSED_BLOCKS: number;
    USED_BLOCKS: number;
    WRITE_REQUESTS: number;
    WRITES: number;
}

export interface KEYCOLUMNUSAGE {
    COLUMN_NAME: string;
    CONSTRAINT_CATALOG: string;
    CONSTRAINT_NAME: string;
    CONSTRAINT_SCHEMA: string;
    ORDINAL_POSITION: number;
    POSITION_IN_UNIQUE_CONSTRAINT: number | null;
    REFERENCED_COLUMN_NAME: string | null;
    REFERENCED_TABLE_NAME: string | null;
    REFERENCED_TABLE_SCHEMA: string | null;
    TABLE_CATALOG: string;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
}

export interface KEYWORDS {
    WORD: string | null;
}

export interface OPTIMIZERCOSTS {
    ENGINE: string;
    OPTIMIZER_DISK_READ_COST: Decimal;
    OPTIMIZER_DISK_READ_RATIO: Decimal;
    OPTIMIZER_INDEX_BLOCK_COPY_COST: Decimal;
    OPTIMIZER_KEY_COMPARE_COST: Decimal;
    OPTIMIZER_KEY_COPY_COST: Decimal;
    OPTIMIZER_KEY_LOOKUP_COST: Decimal;
    OPTIMIZER_KEY_NEXT_FIND_COST: Decimal;
    OPTIMIZER_ROW_COPY_COST: Decimal;
    OPTIMIZER_ROW_LOOKUP_COST: Decimal;
    OPTIMIZER_ROW_NEXT_FIND_COST: Decimal;
    OPTIMIZER_ROWID_COMPARE_COST: Decimal;
    OPTIMIZER_ROWID_COPY_COST: Decimal;
}

export interface OPTIMIZERTRACE {
    INSUFFICIENT_PRIVILEGES: number;
    MISSING_BYTES_BEYOND_MAX_MEM_SIZE: number;
    QUERY: string;
    TRACE: string;
}

export interface PARAMETERS {
    CHARACTER_MAXIMUM_LENGTH: number | null;
    CHARACTER_OCTET_LENGTH: number | null;
    CHARACTER_SET_NAME: string | null;
    COLLATION_NAME: string | null;
    DATA_TYPE: string;
    DATETIME_PRECISION: number | null;
    DTD_IDENTIFIER: string;
    NUMERIC_PRECISION: number | null;
    NUMERIC_SCALE: number | null;
    ORDINAL_POSITION: number;
    PARAMETER_MODE: string | null;
    PARAMETER_NAME: string | null;
    ROUTINE_TYPE: string;
    SPECIFIC_CATALOG: string;
    SPECIFIC_NAME: string;
    SPECIFIC_SCHEMA: string;
}

export interface PARTITIONS {
    AVG_ROW_LENGTH: number;
    CHECK_TIME: Date | null;
    CHECKSUM: number | null;
    CREATE_TIME: Date | null;
    DATA_FREE: number;
    DATA_LENGTH: number;
    INDEX_LENGTH: number;
    MAX_DATA_LENGTH: number | null;
    NODEGROUP: string;
    PARTITION_COMMENT: string;
    PARTITION_DESCRIPTION: string | null;
    PARTITION_EXPRESSION: string | null;
    PARTITION_METHOD: string | null;
    PARTITION_NAME: string | null;
    PARTITION_ORDINAL_POSITION: number | null;
    SUBPARTITION_EXPRESSION: string | null;
    SUBPARTITION_METHOD: string | null;
    SUBPARTITION_NAME: string | null;
    SUBPARTITION_ORDINAL_POSITION: number | null;
    TABLE_CATALOG: string;
    TABLE_NAME: string;
    TABLE_ROWS: number;
    TABLE_SCHEMA: string;
    TABLESPACE_NAME: string | null;
    UPDATE_TIME: Date | null;
}

export interface PLUGINS {
    LOAD_OPTION: string;
    PLUGIN_AUTH_VERSION: string | null;
    PLUGIN_AUTHOR: string | null;
    PLUGIN_DESCRIPTION: string | null;
    PLUGIN_LIBRARY: string | null;
    PLUGIN_LIBRARY_VERSION: string | null;
    PLUGIN_LICENSE: string;
    PLUGIN_MATURITY: string;
    PLUGIN_NAME: string;
    PLUGIN_STATUS: string;
    PLUGIN_TYPE: string;
    PLUGIN_TYPE_VERSION: string;
    PLUGIN_VERSION: string;
}

export interface PROCESSLIST {
    COMMAND: string;
    DB: string | null;
    EXAMINED_ROWS: number;
    HOST: string;
    ID: number;
    INFO: string | null;
    INFO_BINARY: Buffer | null;
    MAX_MEMORY_USED: number;
    MAX_STAGE: number;
    MEMORY_USED: number;
    PROGRESS: Decimal;
    QUERY_ID: number;
    STAGE: number;
    STATE: string | null;
    TID: number;
    TIME: number;
    TIME_MS: Decimal;
    USER: string;
}

export interface PROFILING {
    BLOCK_OPS_IN: number | null;
    BLOCK_OPS_OUT: number | null;
    CONTEXT_INVOLUNTARY: number | null;
    CONTEXT_VOLUNTARY: number | null;
    CPU_SYSTEM: Decimal | null;
    CPU_USER: Decimal | null;
    DURATION: Decimal;
    MESSAGES_RECEIVED: number | null;
    MESSAGES_SENT: number | null;
    PAGE_FAULTS_MAJOR: number | null;
    PAGE_FAULTS_MINOR: number | null;
    QUERY_ID: number;
    SEQ: number;
    SOURCE_FILE: string | null;
    SOURCE_FUNCTION: string | null;
    SOURCE_LINE: number | null;
    STATE: string;
    SWAPS: number | null;
}

export interface REFERENTIALCONSTRAINTS {
    CONSTRAINT_CATALOG: string;
    CONSTRAINT_NAME: string;
    CONSTRAINT_SCHEMA: string;
    DELETE_RULE: string;
    MATCH_OPTION: string;
    REFERENCED_TABLE_NAME: string;
    TABLE_NAME: string;
    UNIQUE_CONSTRAINT_CATALOG: string;
    UNIQUE_CONSTRAINT_NAME: string | null;
    UNIQUE_CONSTRAINT_SCHEMA: string;
    UPDATE_RULE: string;
}

export interface ROUTINES {
    CHARACTER_MAXIMUM_LENGTH: number | null;
    CHARACTER_OCTET_LENGTH: number | null;
    CHARACTER_SET_CLIENT: string;
    CHARACTER_SET_NAME: string | null;
    COLLATION_CONNECTION: string;
    COLLATION_NAME: string | null;
    CREATED: Date;
    DATA_TYPE: string;
    DATABASE_COLLATION: string;
    DATETIME_PRECISION: number | null;
    DEFINER: string;
    DTD_IDENTIFIER: string | null;
    EXTERNAL_LANGUAGE: string | null;
    EXTERNAL_NAME: string | null;
    IS_DETERMINISTIC: string;
    LAST_ALTERED: Date;
    NUMERIC_PRECISION: number | null;
    NUMERIC_SCALE: number | null;
    PARAMETER_STYLE: string;
    ROUTINE_BODY: string;
    ROUTINE_CATALOG: string;
    ROUTINE_COMMENT: string;
    ROUTINE_DEFINITION: string | null;
    ROUTINE_NAME: string;
    ROUTINE_SCHEMA: string;
    ROUTINE_TYPE: string;
    SECURITY_TYPE: string;
    SPECIFIC_NAME: string;
    SQL_DATA_ACCESS: string;
    SQL_MODE: string;
    SQL_PATH: string | null;
}

export interface SCHEMAPRIVILEGES {
    GRANTEE: string;
    IS_GRANTABLE: string;
    PRIVILEGE_TYPE: string;
    TABLE_CATALOG: string;
    TABLE_SCHEMA: string;
}

export interface SCHEMATA {
    CATALOG_NAME: string;
    DEFAULT_CHARACTER_SET_NAME: string;
    DEFAULT_COLLATION_NAME: string;
    SCHEMA_COMMENT: string;
    SCHEMA_NAME: string;
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
    AUTH_NAME: string;
    AUTH_SRID: number;
    SRID: number;
    SRTEXT: string;
}

export interface SQLFUNCTIONS {
    FUNCTION: string | null;
}

export interface STATISTICS {
    CARDINALITY: number | null;
    COLLATION: string | null;
    COLUMN_NAME: string;
    COMMENT: string | null;
    IGNORED: string;
    INDEX_COMMENT: string;
    INDEX_NAME: string;
    INDEX_SCHEMA: string;
    INDEX_TYPE: string;
    NON_UNIQUE: number;
    NULLABLE: string;
    PACKED: string | null;
    SEQ_IN_INDEX: number;
    SUB_PART: number | null;
    TABLE_CATALOG: string;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
}

export interface SYSTEMVARIABLES {
    COMMAND_LINE_ARGUMENT: string | null;
    DEFAULT_VALUE: string | null;
    ENUM_VALUE_LIST: string | null;
    GLOBAL_VALUE: string | null;
    GLOBAL_VALUE_ORIGIN: string;
    GLOBAL_VALUE_PATH: string | null;
    NUMERIC_BLOCK_SIZE: string | null;
    NUMERIC_MAX_VALUE: string | null;
    NUMERIC_MIN_VALUE: string | null;
    READ_ONLY: string;
    SESSION_VALUE: string | null;
    VARIABLE_COMMENT: string;
    VARIABLE_NAME: string;
    VARIABLE_SCOPE: string;
    VARIABLE_TYPE: string;
}

export interface TABLECONSTRAINTS {
    CONSTRAINT_CATALOG: string;
    CONSTRAINT_NAME: string;
    CONSTRAINT_SCHEMA: string;
    CONSTRAINT_TYPE: string;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
}

export interface TABLEPRIVILEGES {
    GRANTEE: string;
    IS_GRANTABLE: string;
    PRIVILEGE_TYPE: string;
    TABLE_CATALOG: string;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
}

export interface TABLES {
    AUTO_INCREMENT: number | null;
    AVG_ROW_LENGTH: number | null;
    CHECK_TIME: Date | null;
    CHECKSUM: number | null;
    CREATE_OPTIONS: string | null;
    CREATE_TIME: Date | null;
    DATA_FREE: number | null;
    DATA_LENGTH: number | null;
    ENGINE: string | null;
    INDEX_LENGTH: number | null;
    MAX_DATA_LENGTH: number | null;
    MAX_INDEX_LENGTH: number | null;
    ROW_FORMAT: string | null;
    TABLE_CATALOG: string;
    TABLE_COLLATION: string | null;
    TABLE_COMMENT: string;
    TABLE_NAME: string;
    TABLE_ROWS: number | null;
    TABLE_SCHEMA: string;
    TABLE_TYPE: string;
    TEMPORARY: string | null;
    UPDATE_TIME: Date | null;
    VERSION: number | null;
}

export interface TABLESPACES {
    AUTOEXTEND_SIZE: number | null;
    ENGINE: string;
    EXTENT_SIZE: number | null;
    LOGFILE_GROUP_NAME: string | null;
    MAXIMUM_SIZE: number | null;
    NODEGROUP_ID: number | null;
    TABLESPACE_COMMENT: string | null;
    TABLESPACE_NAME: string;
    TABLESPACE_TYPE: string | null;
}

export interface TABLESTATISTICS {
    ROWS_CHANGED: number;
    ROWS_CHANGED_X_INDEXES: number;
    ROWS_READ: number;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
}

export interface THREADPOOLGROUPS {
    ACTIVE_THREADS: number;
    CONNECTIONS: number;
    GROUP_ID: number;
    HAS_LISTENER: number;
    IS_STALLED: number;
    QUEUE_LENGTH: number;
    STANDBY_THREADS: number;
    THREADS: number;
}

export interface THREADPOOLQUEUES {
    CONNECTION_ID: number | null;
    GROUP_ID: number;
    POSITION: number;
    PRIORITY: number;
    QUEUEING_TIME_MICROSECONDS: number;
}

export interface THREADPOOLSTATS {
    DEQUEUES_BY_LISTENER: number;
    DEQUEUES_BY_WORKER: number;
    GROUP_ID: number;
    POLLS_BY_LISTENER: number;
    POLLS_BY_WORKER: number;
    STALLS: number;
    THREAD_CREATIONS: number;
    THREAD_CREATIONS_DUE_TO_STALL: number;
    THROTTLES: number;
    WAKES: number;
    WAKES_DUE_TO_STALL: number;
}

export interface THREADPOOLWAITS {
    COUNT: number;
    REASON: string;
}

export interface TRIGGERS {
    ACTION_CONDITION: string | null;
    ACTION_ORDER: number;
    ACTION_ORIENTATION: string;
    ACTION_REFERENCE_NEW_ROW: string;
    ACTION_REFERENCE_NEW_TABLE: string | null;
    ACTION_REFERENCE_OLD_ROW: string;
    ACTION_REFERENCE_OLD_TABLE: string | null;
    ACTION_STATEMENT: string;
    ACTION_TIMING: string;
    CHARACTER_SET_CLIENT: string;
    COLLATION_CONNECTION: string;
    CREATED: Date | null;
    DATABASE_COLLATION: string;
    DEFINER: string;
    EVENT_MANIPULATION: string;
    EVENT_OBJECT_CATALOG: string;
    EVENT_OBJECT_SCHEMA: string;
    EVENT_OBJECT_TABLE: string;
    SQL_MODE: string;
    TRIGGER_CATALOG: string;
    TRIGGER_NAME: string;
    TRIGGER_SCHEMA: string;
}

export interface USERPRIVILEGES {
    GRANTEE: string;
    IS_GRANTABLE: string;
    PRIVILEGE_TYPE: string;
    TABLE_CATALOG: string;
}

export interface USERSTATISTICS {
    ACCESS_DENIED: number;
    BINLOG_BYTES_WRITTEN: number;
    BUSY_TIME: number;
    BYTES_RECEIVED: number;
    BYTES_SENT: number;
    COMMIT_TRANSACTIONS: number;
    CONCURRENT_CONNECTIONS: number;
    CONNECTED_TIME: number;
    CPU_TIME: number;
    DENIED_CONNECTIONS: number;
    EMPTY_QUERIES: number;
    LOST_CONNECTIONS: number;
    MAX_STATEMENT_TIME_EXCEEDED: number;
    OTHER_COMMANDS: number;
    ROLLBACK_TRANSACTIONS: number;
    ROWS_DELETED: number;
    ROWS_INSERTED: number;
    ROWS_READ: number;
    ROWS_SENT: number;
    ROWS_UPDATED: number;
    SELECT_COMMANDS: number;
    TOTAL_CONNECTIONS: number;
    TOTAL_SSL_CONNECTIONS: number;
    UPDATE_COMMANDS: number;
    USER: string;
}

export interface UserVariables {
    CHARACTER_SET_NAME: string | null;
    VARIABLE_NAME: string;
    VARIABLE_TYPE: string;
    VARIABLE_VALUE: string | null;
}

export interface VIEWS {
    ALGORITHM: string;
    CHARACTER_SET_CLIENT: string;
    CHECK_OPTION: string;
    COLLATION_CONNECTION: string;
    DEFINER: string;
    IS_UPDATABLE: string;
    SECURITY_TYPE: string;
    TABLE_CATALOG: string;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
    VIEW_DEFINITION: string;
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
    INNODB_SYS_COLUMNS: INNODBSYSCOLUMNS;
    INNODB_SYS_FIELDS: INNODBSYSFIELDS;
    INNODB_SYS_FOREIGN: INNODBSYSFOREIGN;
    INNODB_SYS_FOREIGN_COLS: INNODBSYSFOREIGNCOLS;
    INNODB_SYS_INDEXES: INNODBSYSINDEXES;
    INNODB_SYS_TABLES: INNODBSYSTABLES;
    INNODB_SYS_TABLESPACES: INNODBSYSTABLESPACES;
    INNODB_SYS_TABLESTATS: INNODBSYSTABLESTATS;
    INNODB_SYS_VIRTUAL: INNODBSYSVIRTUAL;
    INNODB_TABLESPACES_ENCRYPTION: INNODBTABLESPACESENCRYPTION;
    INNODB_TRX: INNODBTRX;
    KEY_CACHES: KEYCACHES;
    KEY_COLUMN_USAGE: KEYCOLUMNUSAGE;
    KEYWORDS: KEYWORDS;
    OPTIMIZER_COSTS: OPTIMIZERCOSTS;
    OPTIMIZER_TRACE: OPTIMIZERTRACE;
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
    THREAD_POOL_GROUPS: THREADPOOLGROUPS;
    THREAD_POOL_QUEUES: THREADPOOLQUEUES;
    THREAD_POOL_STATS: THREADPOOLSTATS;
    THREAD_POOL_WAITS: THREADPOOLWAITS;
    TRIGGERS: TRIGGERS;
    USER_PRIVILEGES: USERPRIVILEGES;
    USER_STATISTICS: USERSTATISTICS;
    user_variables: UserVariables;
    VIEWS: VIEWS;
}
