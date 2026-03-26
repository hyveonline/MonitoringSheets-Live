-- Fix Arabic encoding for Pest Types
UPDATE PAS_PestTypes SET pest_type_ar = N'نمل' WHERE pest_type_en = 'Ant';
UPDATE PAS_PestTypes SET pest_type_ar = N'طيور' WHERE pest_type_en = 'Bird';
UPDATE PAS_PestTypes SET pest_type_ar = N'صرصور' WHERE pest_type_en = 'Cockroach';
UPDATE PAS_PestTypes SET pest_type_ar = N'ذباب' WHERE pest_type_en = 'Fly';
UPDATE PAS_PestTypes SET pest_type_ar = N'أخرى' WHERE pest_type_en = 'Other';
UPDATE PAS_PestTypes SET pest_type_ar = N'قوارض' WHERE pest_type_en = 'Rodent';

-- Fix Arabic encoding for Locations
UPDATE PAS_Locations SET location_ar = N'المطبخ' WHERE location_en = 'Kitchen';
UPDATE PAS_Locations SET location_ar = N'غرفة التخزين' WHERE location_en = 'Storage Room';
UPDATE PAS_Locations SET location_ar = N'منطقة الاستلام' WHERE location_en = 'Receiving Area';
UPDATE PAS_Locations SET location_ar = N'منطقة تناول الطعام' WHERE location_en = 'Dining Area';
UPDATE PAS_Locations SET location_ar = N'منطقة النفايات' WHERE location_en = 'Waste Area';
UPDATE PAS_Locations SET location_ar = N'المكتب' WHERE location_en = 'Office';
