import * as _kmqKnexConfig from "./config/knexfile_kmq";
import * as _kpopVideosKnexConfig from "./config/knexfile_kpop_videos";
import * as Knex from "knex";
import _logger from "./logger";

const logger = _logger("databases");
const kmqKnexConfig: any = _kmqKnexConfig;
const kpopVideosKnexConfig: any = _kpopVideosKnexConfig;

logger.info("Initializing database connections");
const db = {
    kmq: Knex(kmqKnexConfig),
    kpopVideos: Knex(kpopVideosKnexConfig)
}
logger.info("Initialized database connections");


export {
    db
}
