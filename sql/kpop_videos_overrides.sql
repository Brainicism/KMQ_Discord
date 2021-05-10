/* These two are distinct music videos */
UPDATE kpop_videos.app_kpop SET name = 'Roly Poly in Copabana' WHERE vlink = '3Xolk2cFzlo';
UPDATE kpop_videos.app_kpop SET name = 'Roly Poly', vtype = 'main' WHERE vlink = 'afwK0Mv0IsY';

/* 'main' versions are not available in North America, use dance/duplicate instead */
/* Jet Coaster love (jp) */
UPDATE kpop_videos.app_kpop SET vtype = 'duplicate' WHERE vlink = 'cWDzVr3vPsg';
UPDATE kpop_videos.app_kpop SET vtype = 'main' WHERE vlink = 'siOg7ETEkbs';

/* Speed Up (jp) */
UPDATE kpop_videos.app_kpop SET vtype = 'duplicate' WHERE vlink = 'q6tfl41YlJ8';
UPDATE kpop_videos.app_kpop SET vtype = 'main' WHERE vlink = 'bEGQ7qlX6EY';

/* Go Go Summer (jp) */
UPDATE kpop_videos.app_kpop SET vtype = 'duplicate' WHERE vlink = 'ogVMxZTcoCI';
UPDATE kpop_videos.app_kpop SET vtype = 'main' WHERE vlink = '4hES5YumoxA';

/* Jet Coaster love (jp) */
UPDATE kpop_videos.app_kpop SET vtype = 'duplicate' WHERE vlink = 'cWDzVr3vPsg';
UPDATE kpop_videos.app_kpop SET vtype = 'main' WHERE vlink = 'siOg7ETEkbs';

/* Electric Boy (jp) */
UPDATE kpop_videos.app_kpop SET vtype = 'duplicate' WHERE vlink = 'IOk087zgj84';
UPDATE kpop_videos.app_kpop SET vtype = 'main' WHERE vlink = 'cNCmElEQ0F4';

/* Remove ☮ symbols from artist names */
UPDATE kpop_videos.app_kpop_group SET name = REPLACE(name, ' ☮', '');

/* Set group names collation to utfmb4 */
ALTER TABLE kpop_videos.app_kpop_group MODIFY name VARCHAR(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

/* Remove comma from "Car, the garden" */
UPDATE kpop_videos.app_kpop_group SET name = 'Car the garden' WHERE id = 700;

/* T-ara Day by Day, swap main and dance versions. Main version is 15 minutes long */
UPDATE kpop_videos.app_kpop SET vtype = 'duplicate' WHERE vlink = 'brnCe8lL7l4';
UPDATE kpop_videos.app_kpop SET vtype = 'main' WHERE vlink = 'kb6mCsvLqP0';
