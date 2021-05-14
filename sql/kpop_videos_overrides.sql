/* 'main' versions are not available in North America, use dance/duplicate instead */
/* Jet Coaster love (jp) */
UPDATE app_kpop SET vtype = 'duplicate' WHERE vlink = 'cWDzVr3vPsg';
UPDATE app_kpop SET vtype = 'main' WHERE vlink = 'siOg7ETEkbs';

/* Speed Up (jp) */
UPDATE app_kpop SET vtype = 'duplicate' WHERE vlink = 'q6tfl41YlJ8';
UPDATE app_kpop SET vtype = 'main' WHERE vlink = 'bEGQ7qlX6EY';

/* Go Go Summer (jp) */
UPDATE app_kpop SET vtype = 'duplicate' WHERE vlink = 'ogVMxZTcoCI';
UPDATE app_kpop SET vtype = 'main' WHERE vlink = '4hES5YumoxA';

/* Jet Coaster love (jp) */
UPDATE app_kpop SET vtype = 'duplicate' WHERE vlink = 'cWDzVr3vPsg';
UPDATE app_kpop SET vtype = 'main' WHERE vlink = 'siOg7ETEkbs';

/* Electric Boy (jp) */
UPDATE app_kpop SET vtype = 'duplicate' WHERE vlink = 'IOk087zgj84';
UPDATE app_kpop SET vtype = 'main' WHERE vlink = 'cNCmElEQ0F4';

/* Remove ☮ symbols from artist names */
UPDATE app_kpop_group SET name = REPLACE(name, ' ☮', '');

/* Set group names collation to utfmb4 */
ALTER TABLE app_kpop_group MODIFY name VARCHAR(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

/* Remove comma from "Car, the garden" */
UPDATE app_kpop_group SET name = 'Car the garden' WHERE id = 700;

/* T-ara Day by Day, swap main and dance versions. Main version is 15 minutes long */
UPDATE app_kpop SET vtype = 'duplicate' WHERE vlink = 'brnCe8lL7l4';
UPDATE app_kpop SET vtype = 'main' WHERE vlink = 'kb6mCsvLqP0';

/* T-ara Roly Poly, swap long with short version*/
UPDATE app_kpop SET vtype = 'alternate' WHERE vlink = 'afwK0Mv0IsY';
UPDATE app_kpop SET vtype = 'main' WHERE vlink = '3Xu-GYneWQ8';
