-- Service Type Mapping Correction Migration
-- Generated: 2025-08-24T16:00:42.327Z
-- 
-- This migration corrects the service type mappings to match the 
-- "Updated Service line and type mapping.csv" file exactly.
--
-- Summary:
--   - Deletes 110 incorrect service types
--   - Adds 15 missing service types  
--   - Preserves 1 referenced service types
--   - Target: 411 total service types
--

BEGIN;

-- Create backup table
CREATE TABLE IF NOT EXISTS service_types_backup_migration AS 
SELECT * FROM service_types;

-- Delete incorrect service types (not referenced by canonical_items)
DELETE FROM service_types WHERE id IN (
  852, 855, 864, 879, 886, 893, 896, 897, 901, 902, 904, 905, 910, 911, 915, 917, 920, 921, 925, 930, 932, 933, 941, 944, 961, 965, 966, 967, 968, 974, 975, 976, 977, 980, 981, 983, 985, 986, 988, 990, 995, 996, 1001, 1002, 1006, 1008, 1009, 1011, 1012, 1013, 1016, 1017, 1020, 1024, 1035, 1039, 1040, 1047, 1048, 1053, 1058, 1059, 1060, 1061, 1071, 1080, 1083, 1090, 1104, 1105, 1106, 1107, 1109, 1111, 1112, 1113, 1115, 1116, 1117, 1119, 1122, 1123, 1130, 1133, 1136, 1137, 1138, 1139, 1140, 1144, 1145, 1146, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156,
  1157, 1163, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176
);

-- Add missing service types from CSV
INSERT INTO service_types (name, service_line_id) VALUES
  ('Main Line Repair and Replacement', 14) -- Plumbing,
  ('Sewer Maintenance and Repair', 14) -- Plumbing,
  ('Toilet/Urinal Repair and Replacement', 14) -- Plumbing,
  ('Water Line Repair or Replace', 14) -- Plumbing,
  ('Pressure Wash Buses', 17) -- Pressure Washing,
  ('Pressure Wash and Degrease', 17) -- Pressure Washing,
  ('Pressure Wash with Algae Removal', 17) -- Pressure Washing,
  ('Pressure Washing with Water Reclamation', 17) -- Pressure Washing,
  ('Sidewalk Pressure Washing w/o Gum Removal', 17) -- Pressure Washing,
  ('Alarm Installation and Repair', 18) -- Security,
  ('Automatic Security Gate Repair and Replacemenet', 18) -- Security,
  ('Fire watch', 18) -- Security,
  ('Security Camera Installation and Maintenance', 18) -- Security,
  ('Security Door Repair and Replacement', 18) -- Security,
  ('Security Gate Repair and Replacement', 18) -- Security;

-- Verify final counts
SELECT 
  sl.name AS service_line,
  COUNT(st.id) AS service_type_count
FROM service_lines sl
LEFT JOIN service_types st ON st.service_line_id = sl.id
GROUP BY sl.id, sl.name
ORDER BY sl.name;

-- Overall summary
SELECT 
  COUNT(*) as total_service_types,
  COUNT(DISTINCT service_line_id) as service_lines_with_types
FROM service_types;

COMMIT;

-- Rollback script (if needed):
-- DELETE FROM service_types;
-- INSERT INTO service_types SELECT * FROM service_types_backup_migration;
-- DROP TABLE service_types_backup_migration;
