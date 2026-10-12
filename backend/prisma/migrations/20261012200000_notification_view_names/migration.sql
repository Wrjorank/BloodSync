-- dashboard views were renamed to english slugs
UPDATE "notifications" SET "view" = CASE "view"
    WHEN 'stok' THEN 'stock'
    WHEN 'permintaan' THEN 'requests'
    WHEN 'pemindai' THEN 'scanner'
    WHEN 'pendonor' THEN 'donors'
    ELSE "view"
END;
