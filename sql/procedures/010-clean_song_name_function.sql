DELIMITER //
DROP FUNCTION IF EXISTS CleanSongName //
CREATE FUNCTION CleanSongName(str TEXT) RETURNS TEXT DETERMINISTIC
BEGIN
  -- Lowercase replacements
  SET str = REPLACE(str, 'á', 'a');
  SET str = REPLACE(str, 'à', 'a');
  SET str = REPLACE(str, 'ä', 'a');
  SET str = REPLACE(str, 'â', 'a');
  SET str = REPLACE(str, 'ã', 'a');
  SET str = REPLACE(str, 'å', 'a');
  SET str = REPLACE(str, 'æ', 'ae');
  SET str = REPLACE(str, 'é', 'e');
  SET str = REPLACE(str, 'è', 'e');
  SET str = REPLACE(str, 'ë', 'e');
  SET str = REPLACE(str, 'ê', 'e');
  SET str = REPLACE(str, 'í', 'i');
  SET str = REPLACE(str, 'ì', 'i');
  SET str = REPLACE(str, 'ï', 'i');
  SET str = REPLACE(str, 'î', 'i');
  SET str = REPLACE(str, 'ó', 'o');
  SET str = REPLACE(str, 'ò', 'o');
  SET str = REPLACE(str, 'ö', 'o');
  SET str = REPLACE(str, 'ô', 'o');
  SET str = REPLACE(str, 'õ', 'o');
  SET str = REPLACE(str, 'ø', 'o');
  SET str = REPLACE(str, 'ú', 'u');
  SET str = REPLACE(str, 'ù', 'u');
  SET str = REPLACE(str, 'ü', 'u');
  SET str = REPLACE(str, 'û', 'u');
  SET str = REPLACE(str, 'ñ', 'n');
  SET str = REPLACE(str, 'ç', 'c');

  -- Uppercase replacements
  SET str = REPLACE(str, 'Á', 'A');
  SET str = REPLACE(str, 'À', 'A');
  SET str = REPLACE(str, 'Ä', 'A');
  SET str = REPLACE(str, 'Â', 'A');
  SET str = REPLACE(str, 'Ã', 'A');
  SET str = REPLACE(str, 'Å', 'A');
  SET str = REPLACE(str, 'É', 'E');
  SET str = REPLACE(str, 'È', 'E');
  SET str = REPLACE(str, 'Ë', 'E');
  SET str = REPLACE(str, 'Ê', 'E');
  SET str = REPLACE(str, 'Í', 'I');
  SET str = REPLACE(str, 'Ì', 'I');
  SET str = REPLACE(str, 'Ï', 'I');
  SET str = REPLACE(str, 'Î', 'I');
  SET str = REPLACE(str, 'Ó', 'O');
  SET str = REPLACE(str, 'Ò', 'O');
  SET str = REPLACE(str, 'Ö', 'O');
  SET str = REPLACE(str, 'Ô', 'O');
  SET str = REPLACE(str, 'Õ', 'O');
  SET str = REPLACE(str, 'Ø', 'O');
  SET str = REPLACE(str, 'Ú', 'U');
  SET str = REPLACE(str, 'Ù', 'U');
  SET str = REPLACE(str, 'Ü', 'U');
  SET str = REPLACE(str, 'Û', 'U');
  SET str = REPLACE(str, 'Ñ', 'N');
  SET str = REPLACE(str, 'Ç', 'C');

  SET str = REGEXP_REPLACE(str, '[^0-9a-zA-Z]', '');
  RETURN str;
END;
