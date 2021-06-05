DELIMITER //
DROP PROCEDURE IF EXISTS OverridePublishDates //
CREATE PROCEDURE OverridePublishDates()
BEGIN
    UPDATE available_songs, publish_date_overrides
    SET available_songs.publishedon = publish_date_overrides.override_data
    WHERE available_songs.link = publish_date_overrides.video_id;
    
END //

DROP TRIGGER IF EXISTS update_publish_overrides_trigger //
CREATE TRIGGER update_publish_overrides_trigger
AFTER UPDATE
ON publish_date_overrides
FOR EACH ROW
CALL OverridePublishDates() //

DROP TRIGGER IF EXISTS insert_publish_overrides_trigger //
CREATE TRIGGER insert_publish_overrides_trigger
AFTER INSERT
ON publish_date_overrides
FOR EACH ROW
CALL OverridePublishDates() //

DELIMITER ;
