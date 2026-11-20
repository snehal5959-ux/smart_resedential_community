-- Approved staged tenant-scoping migration for Nestora.
-- Existing app-owned rows are intentionally left with NULL society_id until
-- their society mapping is reviewed and backfilled. Do not make these columns
-- NOT NULL until every existing row has been mapped and verified.

ALTER TABLE app_user
  ADD COLUMN society_id INT NULL,
  ADD KEY ix_app_user_society (society_id),
  ADD CONSTRAINT fk_app_user_society
    FOREIGN KEY (society_id) REFERENCES society(society_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE amenity
  ADD COLUMN society_id INT NULL,
  ADD KEY ix_amenity_society (society_id),
  ADD CONSTRAINT fk_amenity_society
    FOREIGN KEY (society_id) REFERENCES society(society_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE amenity_booking
  ADD COLUMN society_id INT NULL,
  ADD KEY ix_amenity_booking_society (society_id),
  ADD CONSTRAINT fk_amenity_booking_society
    FOREIGN KEY (society_id) REFERENCES society(society_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE community_complaint
  ADD COLUMN society_id INT NULL,
  ADD KEY ix_community_complaint_society (society_id),
  ADD CONSTRAINT fk_community_complaint_society
    FOREIGN KEY (society_id) REFERENCES society(society_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE community_notice
  ADD COLUMN society_id INT NULL,
  ADD KEY ix_community_notice_society (society_id),
  ADD CONSTRAINT fk_community_notice_society
    FOREIGN KEY (society_id) REFERENCES society(society_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE maintenance_bill
  ADD COLUMN society_id INT NULL,
  ADD KEY ix_maintenance_bill_society (society_id),
  ADD CONSTRAINT fk_maintenance_bill_society
    FOREIGN KEY (society_id) REFERENCES society(society_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE maintenance_payment
  ADD COLUMN society_id INT NULL,
  ADD KEY ix_maintenance_payment_society (society_id),
  ADD CONSTRAINT fk_maintenance_payment_society
    FOREIGN KEY (society_id) REFERENCES society(society_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE community_visitor
  ADD COLUMN society_id INT NULL,
  ADD KEY ix_community_visitor_society (society_id),
  ADD CONSTRAINT fk_community_visitor_society
    FOREIGN KEY (society_id) REFERENCES society(society_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE flat_smart_lock
  ADD COLUMN society_id INT NULL,
  ADD KEY ix_flat_smart_lock_society (society_id),
  ADD CONSTRAINT fk_flat_smart_lock_society
    FOREIGN KEY (society_id) REFERENCES society(society_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE flat_lock_event
  ADD COLUMN society_id INT NULL,
  ADD KEY ix_flat_lock_event_society (society_id),
  ADD CONSTRAINT fk_flat_lock_event_society
    FOREIGN KEY (society_id) REFERENCES society(society_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE resident
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- User approved assigning the existing administrator to Sunshine Heights.
UPDATE app_user
SET society_id = 4
WHERE user_id = 1
  AND role = 'admin'
  AND resident_id IS NULL;
