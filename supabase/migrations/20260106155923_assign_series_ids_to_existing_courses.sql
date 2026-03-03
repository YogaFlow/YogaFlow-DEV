/*
  # Zuweisung von Series-IDs zu bestehenden Kursen

  1. Zweck
    - Weist bestehenden Kursen ohne series_id eine gemeinsame ID zu
    - Gruppiert Kurse nach: Titel, Zeit, Ort und Lehrer
    - Nur Gruppen mit mehr als einem Kurs werden als Serie behandelt

  2. Logik
    - Identifiziert Kursgruppen die zusammengehören
    - Generiert für jede Gruppe eine eindeutige series_id
    - Aktualisiert alle Kurse der Gruppe mit der series_id

  3. Wichtig
    - Betrifft nur Kurse ohne series_id
    - Mindestens 2 Kurse müssen zusammengehören
    - Einmalige Migration für bestehende Daten
*/

DO $$
DECLARE
  course_group RECORD;
  new_series_id uuid;
BEGIN
  -- Iteriere über alle Kursgruppen ohne series_id, die mehr als einen Kurs haben
  FOR course_group IN
    SELECT 
      title, 
      time, 
      location, 
      teacher_id,
      array_agg(id) as course_ids
    FROM courses
    WHERE series_id IS NULL
    GROUP BY title, time, location, teacher_id
    HAVING COUNT(*) > 1
  LOOP
    -- Generiere eine neue series_id für diese Gruppe
    new_series_id := gen_random_uuid();
    
    -- Aktualisiere alle Kurse in dieser Gruppe mit der neuen series_id
    UPDATE courses
    SET 
      series_id = new_series_id,
      updated_at = now()
    WHERE id = ANY(course_group.course_ids);
    
    RAISE NOTICE 'Serie erstellt: % Kurse für "%" bekamen series_id %', 
      array_length(course_group.course_ids, 1), 
      course_group.title, 
      new_series_id;
  END LOOP;
END $$;
