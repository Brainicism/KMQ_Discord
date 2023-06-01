-- MySQL dump 10.19  Distrib 10.3.38-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: 127.0.0.1    Database: kmq_test
-- ------------------------------------------------------
-- Server version	10.3.38-MariaDB-0ubuntu0.20.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `badges`
--

DROP TABLE IF EXISTS `badges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `badges` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `priority` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `badges`
--

LOCK TABLES `badges` WRITE;
/*!40000 ALTER TABLE `badges` DISABLE KEYS */;
/*!40000 ALTER TABLE `badges` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `badges_players`
--

DROP TABLE IF EXISTS `badges_players`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `badges_players` (
  `user_id` varchar(255) NOT NULL,
  `badge_id` int(11) NOT NULL,
  PRIMARY KEY (`user_id`,`badge_id`),
  KEY `badges_players_badge_id_foreign` (`badge_id`),
  CONSTRAINT `badges_players_badge_id_foreign` FOREIGN KEY (`badge_id`) REFERENCES `badges` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `badges_players`
--

LOCK TABLES `badges_players` WRITE;
/*!40000 ALTER TABLE `badges_players` DISABLE KEYS */;
/*!40000 ALTER TABLE `badges_players` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bookmarked_songs`
--

DROP TABLE IF EXISTS `bookmarked_songs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bookmarked_songs` (
  `user_id` varchar(255) NOT NULL,
  `vlink` varchar(255) NOT NULL,
  `bookmarked_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bookmarked_songs`
--

LOCK TABLES `bookmarked_songs` WRITE;
/*!40000 ALTER TABLE `bookmarked_songs` DISABLE KEYS */;
/*!40000 ALTER TABLE `bookmarked_songs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cached_song_duration`
--

DROP TABLE IF EXISTS `cached_song_duration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cached_song_duration` (
  `vlink` varchar(255) NOT NULL,
  `duration` smallint(6) NOT NULL,
  UNIQUE KEY `cached_song_duration_vlink_unique` (`vlink`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cached_song_duration`
--

LOCK TABLES `cached_song_duration` WRITE;
/*!40000 ALTER TABLE `cached_song_duration` DISABLE KEYS */;
/*!40000 ALTER TABLE `cached_song_duration` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `competition_moderators`
--

DROP TABLE IF EXISTS `competition_moderators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `competition_moderators` (
  `guild_id` varchar(255) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  PRIMARY KEY (`guild_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `competition_moderators`
--

LOCK TABLES `competition_moderators` WRITE;
/*!40000 ALTER TABLE `competition_moderators` DISABLE KEYS */;
/*!40000 ALTER TABLE `competition_moderators` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `daily_stats`
--

DROP TABLE IF EXISTS `daily_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `daily_stats` (
  `date` date NOT NULL,
  `gameSessions` int(11) NOT NULL DEFAULT 0,
  `roundsPlayed` int(11) NOT NULL DEFAULT 0,
  `players` int(11) NOT NULL DEFAULT 0,
  `newPlayers` int(11) NOT NULL DEFAULT 0,
  `serverCount` int(11) NOT NULL DEFAULT 0,
  UNIQUE KEY `daily_stats_date_unique` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `daily_stats`
--

LOCK TABLES `daily_stats` WRITE;
/*!40000 ALTER TABLE `daily_stats` DISABLE KEYS */;
/*!40000 ALTER TABLE `daily_stats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dead_links`
--

DROP TABLE IF EXISTS `dead_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `dead_links` (
  `vlink` varchar(255) NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`vlink`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dead_links`
--

LOCK TABLES `dead_links` WRITE;
/*!40000 ALTER TABLE `dead_links` DISABLE KEYS */;
/*!40000 ALTER TABLE `dead_links` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `game_messages`
--

DROP TABLE IF EXISTS `game_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_messages` (
  `category` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `weight` int(11) NOT NULL DEFAULT 1,
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `game_messages`
--

LOCK TABLES `game_messages` WRITE;
/*!40000 ALTER TABLE `game_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `game_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `game_option_presets`
--

DROP TABLE IF EXISTS `game_option_presets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_option_presets` (
  `guild_id` varchar(255) NOT NULL,
  `preset_name` varchar(255) NOT NULL,
  `option_name` varchar(255) NOT NULL,
  `option_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  UNIQUE KEY `game_option_presets_guild_id_preset_name_option_name_unique` (`guild_id`,`preset_name`,`option_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `game_option_presets`
--

LOCK TABLES `game_option_presets` WRITE;
/*!40000 ALTER TABLE `game_option_presets` DISABLE KEYS */;
/*!40000 ALTER TABLE `game_option_presets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `game_option_presets_json`
--

DROP TABLE IF EXISTS `game_option_presets_json`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_option_presets_json` (
  `guild_id` varchar(255) NOT NULL,
  `preset_name` varchar(255) NOT NULL,
  `game_options` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (`guild_id`,`preset_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `game_option_presets_json`
--

LOCK TABLES `game_option_presets_json` WRITE;
/*!40000 ALTER TABLE `game_option_presets_json` DISABLE KEYS */;
/*!40000 ALTER TABLE `game_option_presets_json` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `game_options`
--

DROP TABLE IF EXISTS `game_options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_options` (
  `guild_id` varchar(255) NOT NULL,
  `option_name` varchar(255) NOT NULL,
  `option_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `client_id` varchar(255) NOT NULL DEFAULT '708411013384634371',
  UNIQUE KEY `game_options_guild_id_option_name_client_id_unique` (`guild_id`,`option_name`,`client_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `game_options`
--

LOCK TABLES `game_options` WRITE;
/*!40000 ALTER TABLE `game_options` DISABLE KEYS */;
/*!40000 ALTER TABLE `game_options` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `game_sessions`
--

DROP TABLE IF EXISTS `game_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_sessions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `start_date` datetime NOT NULL,
  `guild_id` varchar(255) NOT NULL,
  `num_participants` int(11) NOT NULL,
  `avg_guess_time` float(8,2) NOT NULL,
  `session_length` float(8,2) NOT NULL,
  `rounds_played` int(11) NOT NULL,
  `correct_guesses` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `game_sessions_start_date_index` (`start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `game_sessions`
--

LOCK TABLES `game_sessions` WRITE;
/*!40000 ALTER TABLE `game_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `game_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `guilds`
--

DROP TABLE IF EXISTS `guilds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `guilds` (
  `guild_id` varchar(64) NOT NULL,
  `join_date` datetime NOT NULL,
  `last_active` datetime DEFAULT NULL,
  `games_played` int(11) NOT NULL DEFAULT 0,
  `songs_guessed` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `guilds`
--

LOCK TABLES `guilds` WRITE;
/*!40000 ALTER TABLE `guilds` DISABLE KEYS */;
/*!40000 ALTER TABLE `guilds` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `knex_migrations`
--

DROP TABLE IF EXISTS `knex_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `knex_migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `batch` int(11) DEFAULT NULL,
  `migration_time` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `knex_migrations`
--

LOCK TABLES `knex_migrations` WRITE;
/*!40000 ALTER TABLE `knex_migrations` DISABLE KEYS */;
INSERT INTO `knex_migrations` VALUES (1,'20200530145825_guild_preferences.js',1,'2023-05-20 03:19:52'),(2,'20200726213404_restart_table.js',1,'2023-05-20 03:19:52'),(3,'20200802155423_usage-data.js',1,'2023-05-20 03:19:52'),(4,'20200804002244_game-session-table.js',1,'2023-05-20 03:19:52'),(5,'20200815154316_not-downloaded.js',1,'2023-05-20 03:19:52'),(6,'20200815163208_deadlinks.js',1,'2023-05-20 03:19:52'),(7,'20201031163516_guild_preferences_index.js',1,'2023-05-20 03:19:52'),(8,'20201106004706_player_stats_table.js',1,'2023-05-20 03:19:52'),(9,'20201123155842_store-daily-stats.js',1,'2023-05-20 03:19:52'),(10,'20210112130147_player-exp-system.js',1,'2023-05-20 03:19:52'),(11,'20210117140712_leaderboard_enrollment.js',1,'2023-05-20 03:19:52'),(12,'20210117201417_leaderboard_enrollment_display_charset.js',1,'2023-05-20 03:19:53'),(13,'20210118113657_leaderboard_enrollment_display_utf8mb4.js',1,'2023-05-20 03:19:53'),(14,'20210123222227_player-server-table.js',1,'2023-05-20 03:19:53'),(15,'20210402030127_add_correct_guesses_to_game-session-table.js',1,'2023-05-20 03:19:53'),(16,'20210402031946_song_guess_count.js',1,'2023-05-20 03:19:53'),(17,'20210403131250_game-option-presets.js',1,'2023-05-20 03:19:53'),(18,'20210417005116_top_gg_user_votes.js',1,'2023-05-20 03:19:53'),(19,'20210418172425_top_gg_user_votes_bonus_expiry.js',1,'2023-05-20 03:19:53'),(20,'20210515023220_rename_json_presets.js',1,'2023-05-20 03:19:53'),(21,'20210515215351_game_options.js',1,'2023-05-20 03:19:53'),(22,'20210518065112_game_options_presets_by_option.js',1,'2023-05-20 03:19:53'),(23,'20210518215005_remove_guild_preference_json.js',1,'2023-05-20 03:19:55'),(24,'20210528022206_badges.js',1,'2023-05-20 03:19:56'),(25,'20210605023240_publish_date_overrides_table.js',1,'2023-05-20 03:19:56'),(26,'20210605035348_end_game_messages_table.js',1,'2023-05-20 03:19:56'),(27,'20210606234249_cached_song_duration.js',1,'2023-05-20 03:19:56'),(28,'20210619035132_drop-publish-date-overrides.js',1,'2023-05-20 03:19:56'),(29,'20210724002405_cluster_stats.js',1,'2023-05-20 03:19:56'),(30,'20210814061902_rename_end_game_messages.js',1,'2023-05-20 03:19:56'),(31,'20210819022349_system_statistics.js',1,'2023-05-20 03:19:56'),(32,'20210819160851_bookmarked_songs.js',1,'2023-05-20 03:19:57'),(33,'20210821155505_premium_users.js',1,'2023-05-20 03:19:57'),(34,'20210825230408_nullable_cluster_id_system_stats.js',1,'2023-05-20 03:19:57'),(35,'20210828065453_player_game_session_stats_table.js',1,'2023-05-20 03:19:57'),(36,'20210831203402_guild_preference_primary_idx.js',1,'2023-05-20 03:19:57'),(37,'20210906065406_competition_moderators.js',1,'2023-05-20 03:19:57'),(38,'20210925060749_badges_refactor.js',1,'2023-05-20 03:19:57'),(39,'20210926083508_badges_migrate_table.js',1,'2023-05-20 03:19:58'),(40,'20211002052649_drop_cluster_stats_table.js',1,'2023-05-20 03:19:58'),(41,'20211109030655_sql_overrides_table.js',1,'2023-05-20 03:19:58'),(42,'20211109064140_dead_links_unique.js',1,'2023-05-20 03:19:59'),(43,'20211216025236_song_guess_count_to_song_metadata.js',1,'2023-05-20 03:19:59'),(44,'20211222105158_locale.js',1,'2023-05-20 03:19:59'),(45,'20220218012204_guild_preferences_to_guild_metadata.js',1,'2023-05-20 03:19:59'),(46,'20220218013908_client_id_in_game_options.js',1,'2023-05-20 03:19:59'),(47,'20220409183111_deprecate_old_shuffle.js',1,'2023-05-20 03:19:59'),(48,'20220514235230_game-messages-varchar-to-text.js',1,'2023-05-20 03:19:59'),(49,'20220605044555_bookmarked_songs_date.js',1,'2023-05-20 03:20:00'),(50,'20220703183828_drop_restart_notifications_table.js',1,'2023-05-20 03:20:00'),(51,'20230330043817_game-sessions-index.js',1,'2023-05-20 03:20:00'),(52,'20230520010855_non-nullable-fields.js',1,'2023-05-20 03:20:02');
/*!40000 ALTER TABLE `knex_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `knex_migrations_lock`
--

DROP TABLE IF EXISTS `knex_migrations_lock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `knex_migrations_lock` (
  `index` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `is_locked` int(11) DEFAULT NULL,
  PRIMARY KEY (`index`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `knex_migrations_lock`
--

LOCK TABLES `knex_migrations_lock` WRITE;
/*!40000 ALTER TABLE `knex_migrations_lock` DISABLE KEYS */;
INSERT INTO `knex_migrations_lock` VALUES (1,0);
/*!40000 ALTER TABLE `knex_migrations_lock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `kpop_videos_sql_overrides`
--

DROP TABLE IF EXISTS `kpop_videos_sql_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kpop_videos_sql_overrides` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `query` varchar(255) NOT NULL,
  `reason` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `kpop_videos_sql_overrides`
--

LOCK TABLES `kpop_videos_sql_overrides` WRITE;
/*!40000 ALTER TABLE `kpop_videos_sql_overrides` DISABLE KEYS */;
INSERT INTO `kpop_videos_sql_overrides` VALUES (1,'UPDATE app_kpop SET vtype = \'duplicate\' WHERE vlink = \'cWDzVr3vPsg\';','Jet Coaster love (jp) | main not available in NA'),(2,'UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'siOg7ETEkbs\';','Jet Coaster love (jp) | main not available in NA'),(3,'UPDATE app_kpop SET vtype = \'duplicate\' WHERE vlink = \'q6tfl41YlJ8\';','Speed Up (jp) | main not available in NA'),(4,'UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'bEGQ7qlX6EY\';','Speed Up (jp) | main not available in NA'),(5,'UPDATE app_kpop SET vtype = \'duplicate\' WHERE vlink = \'ogVMxZTcoCI\';','Electric Boy (jp) | main not available in NA'),(6,'UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'4hES5YumoxA\';','Electric Boy (jp) | main not available in NA'),(7,'UPDATE app_kpop_group SET name = REPLACE(name, \' ☮\', \'\');','Remove ☮ symbols from artist names'),(8,'UPDATE app_kpop_group SET name = \'Car the garden\' WHERE id = 700;','Remove comma from \"Car, the garden\"'),(9,'UPDATE app_kpop SET vtype = \'duplicate\' WHERE vlink = \'brnCe8lL7l4\';','Day by Day - T-ara | swap main and dance versions. Main version is 15 minutes long '),(10,'UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'kb6mCsvLqP0\';','Day by Day - T-ara | swap main and dance versions. Main version is 15 minutes long '),(11,'UPDATE app_kpop SET vtype = \'alternate\' WHERE vlink = \'afwK0Mv0IsY\';','Roly Poly - T-ara | swap long with short version'),(12,'UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'3Xu-GYneWQ8\';','Roly Poly - T-ara | swap long with short version'),(13,'UPDATE app_kpop SET vtype = \'alternate\' WHERE vlink = \'gJNWy8gEOHs\';','Come Over Tonight - Wonho | swap with better quality version'),(14,'UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'USPd8yM_jHk\';','Come Over Tonight - Wonho | swap with better quality version'),(15,'UPDATE app_kpop SET vtype = \'alternate\' WHERE vlink = \'QmgcyLozkbQ\';','Dionysus - BTS | swap with better quality version'),(16,'UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'bccr1BwNI0Y\';','Dionysus - BTS | swap with better quality version');
/*!40000 ALTER TABLE `kpop_videos_sql_overrides` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `kysely_migration`
--

DROP TABLE IF EXISTS `kysely_migration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kysely_migration` (
  `name` varchar(255) NOT NULL,
  `timestamp` varchar(255) NOT NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `kysely_migration`
--

LOCK TABLES `kysely_migration` WRITE;
/*!40000 ALTER TABLE `kysely_migration` DISABLE KEYS */;
/*!40000 ALTER TABLE `kysely_migration` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `kysely_migration_lock`
--

DROP TABLE IF EXISTS `kysely_migration_lock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kysely_migration_lock` (
  `id` varchar(255) NOT NULL,
  `is_locked` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `kysely_migration_lock`
--

LOCK TABLES `kysely_migration_lock` WRITE;
/*!40000 ALTER TABLE `kysely_migration_lock` DISABLE KEYS */;
INSERT INTO `kysely_migration_lock` VALUES ('migration_lock',0);
/*!40000 ALTER TABLE `kysely_migration_lock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `leaderboard_enrollment`
--

DROP TABLE IF EXISTS `leaderboard_enrollment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `leaderboard_enrollment` (
  `display_name` varchar(255) NOT NULL,
  `player_id` varchar(255) NOT NULL,
  UNIQUE KEY `leaderboard_enrollment_player_id_unique` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leaderboard_enrollment`
--

LOCK TABLES `leaderboard_enrollment` WRITE;
/*!40000 ALTER TABLE `leaderboard_enrollment` DISABLE KEYS */;
/*!40000 ALTER TABLE `leaderboard_enrollment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `locale`
--

DROP TABLE IF EXISTS `locale`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `locale` (
  `guild_id` varchar(255) NOT NULL,
  `locale` varchar(255) NOT NULL,
  PRIMARY KEY (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `locale`
--

LOCK TABLES `locale` WRITE;
/*!40000 ALTER TABLE `locale` DISABLE KEYS */;
/*!40000 ALTER TABLE `locale` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `not_downloaded`
--

DROP TABLE IF EXISTS `not_downloaded`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `not_downloaded` (
  `vlink` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `not_downloaded`
--

LOCK TABLES `not_downloaded` WRITE;
/*!40000 ALTER TABLE `not_downloaded` DISABLE KEYS */;
/*!40000 ALTER TABLE `not_downloaded` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `player_game_session_stats`
--

DROP TABLE IF EXISTS `player_game_session_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `player_game_session_stats` (
  `player_id` varchar(255) NOT NULL,
  `date` datetime NOT NULL,
  `songs_guessed` int(11) NOT NULL DEFAULT 0,
  `exp_gained` int(11) NOT NULL DEFAULT 0,
  `levels_gained` int(11) NOT NULL DEFAULT 0,
  UNIQUE KEY `player_game_session_stats_player_id_date_unique` (`player_id`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `player_game_session_stats`
--

LOCK TABLES `player_game_session_stats` WRITE;
/*!40000 ALTER TABLE `player_game_session_stats` DISABLE KEYS */;
/*!40000 ALTER TABLE `player_game_session_stats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `player_servers`
--

DROP TABLE IF EXISTS `player_servers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `player_servers` (
  `player_id` varchar(255) NOT NULL,
  `server_id` varchar(255) NOT NULL,
  PRIMARY KEY (`player_id`,`server_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `player_servers`
--

LOCK TABLES `player_servers` WRITE;
/*!40000 ALTER TABLE `player_servers` DISABLE KEYS */;
/*!40000 ALTER TABLE `player_servers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `player_stats`
--

DROP TABLE IF EXISTS `player_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `player_stats` (
  `player_id` varchar(255) NOT NULL,
  `songs_guessed` int(11) NOT NULL DEFAULT 0,
  `games_played` int(11) NOT NULL DEFAULT 0,
  `first_play` datetime NOT NULL DEFAULT current_timestamp(),
  `last_active` datetime NOT NULL DEFAULT current_timestamp(),
  `exp` int(11) NOT NULL DEFAULT 0,
  `level` int(11) NOT NULL DEFAULT 1,
  UNIQUE KEY `player_stats_player_id_unique` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `player_stats`
--

LOCK TABLES `player_stats` WRITE;
/*!40000 ALTER TABLE `player_stats` DISABLE KEYS */;
/*!40000 ALTER TABLE `player_stats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `premium_users`
--

DROP TABLE IF EXISTS `premium_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `premium_users` (
  `user_id` varchar(255) NOT NULL,
  `active` tinyint(1) NOT NULL,
  `first_subscribed` datetime NOT NULL,
  `source` enum('patreon','loyalty') NOT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `premium_users`
--

LOCK TABLES `premium_users` WRITE;
/*!40000 ALTER TABLE `premium_users` DISABLE KEYS */;
/*!40000 ALTER TABLE `premium_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `song_metadata`
--

DROP TABLE IF EXISTS `song_metadata`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `song_metadata` (
  `vlink` varchar(255) NOT NULL,
  `correct_guesses_legacy` int(11) NOT NULL,
  `rounds_played_legacy` int(11) NOT NULL,
  `correct_guesses` int(11) NOT NULL DEFAULT 0,
  `rounds_played` int(11) NOT NULL DEFAULT 0,
  `skip_count` int(11) NOT NULL DEFAULT 0,
  `hint_count` int(11) NOT NULL DEFAULT 0,
  `time_to_guess_ms` int(11) NOT NULL DEFAULT 0,
  `time_played_ms` int(11) NOT NULL DEFAULT 0,
  UNIQUE KEY `song_guess_count_vlink_unique` (`vlink`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `song_metadata`
--

LOCK TABLES `song_metadata` WRITE;
/*!40000 ALTER TABLE `song_metadata` DISABLE KEYS */;
/*!40000 ALTER TABLE `song_metadata` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `system_stats`
--

DROP TABLE IF EXISTS `system_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_stats` (
  `cluster_id` int(11) DEFAULT NULL,
  `stat_name` varchar(255) NOT NULL,
  `stat_value` int(11) NOT NULL,
  `date` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_stats`
--

LOCK TABLES `system_stats` WRITE;
/*!40000 ALTER TABLE `system_stats` DISABLE KEYS */;
/*!40000 ALTER TABLE `system_stats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `top_gg_user_votes`
--

DROP TABLE IF EXISTS `top_gg_user_votes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `top_gg_user_votes` (
  `user_id` varchar(255) NOT NULL,
  `buff_expiry_date` datetime NOT NULL,
  `total_votes` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `top_gg_user_votes`
--

LOCK TABLES `top_gg_user_votes` WRITE;
/*!40000 ALTER TABLE `top_gg_user_votes` DISABLE KEYS */;
/*!40000 ALTER TABLE `top_gg_user_votes` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2023-06-01  2:32:37
