-- ========================================================
-- Barangay Pembo E-Hub Database Schema & Clean Seed Data
-- Compatible with MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.4+
-- Generated: 2026-09-17 19:59:12
-- ========================================================

CREATE DATABASE IF NOT EXISTS `pembo_ehub_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `pembo_ehub_db`;

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET time_zone = '+08:00';

-- --------------------------------------------------------
-- Table structure for `roles`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `roles`
INSERT INTO `roles` (`id`, `name`, `description`, `created_at`) VALUES ('1', 'ADMIN', 'Barangay Administrator / IT System Admin', '2026-09-03 18:13:09');
INSERT INTO `roles` (`id`, `name`, `description`, `created_at`) VALUES ('2', 'STAFF', 'Barangay Staff / Desk Officer', '2026-09-03 18:13:09');
INSERT INTO `roles` (`id`, `name`, `description`, `created_at`) VALUES ('3', 'RESIDENT', 'Barangay Pembo Resident Constituent', '2026-09-03 18:13:09');

-- --------------------------------------------------------
-- Table structure for `users`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` char(36) NOT NULL,
  `role_id` int(10) unsigned NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `email_verified_at` datetime DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_role_id` (`role_id`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `users`
INSERT INTO `users` (`id`, `role_id`, `email`, `password_hash`, `is_active`, `email_verified_at`, `last_login_at`, `created_at`, `updated_at`) VALUES ('11111111-1111-1111-1111-111111111111', '1', 'admin@pembo.gov.ph', '$2y$12$2bxwEh1GkUur.5rVlqfo.u6LLBBTZdM8booflOdIMSs5ohvW4CbbW', '1', '2026-09-18 01:58:47', NULL, '2026-09-18 01:58:47', '2026-09-18 01:58:47');
INSERT INTO `users` (`id`, `role_id`, `email`, `password_hash`, `is_active`, `email_verified_at`, `last_login_at`, `created_at`, `updated_at`) VALUES ('22222222-2222-2222-2222-222222222221', '2', 'amir.abdulbayan@pembo.gov.ph', '$2y$12$Jw0KT6fIR6aZIEDjS4fc/u4kGjYfKVsdbvjwxngBuUzpsLnux9qo.', '1', '2026-09-18 01:58:47', NULL, '2026-09-18 01:58:47', '2026-09-18 01:58:47');
INSERT INTO `users` (`id`, `role_id`, `email`, `password_hash`, `is_active`, `email_verified_at`, `last_login_at`, `created_at`, `updated_at`) VALUES ('22222222-2222-2222-2222-222222222222', '2', 'christian.baligod@pembo.gov.ph', '$2y$12$Jw0KT6fIR6aZIEDjS4fc/u4kGjYfKVsdbvjwxngBuUzpsLnux9qo.', '1', '2026-09-18 01:58:47', NULL, '2026-09-18 01:58:47', '2026-09-18 01:58:47');
INSERT INTO `users` (`id`, `role_id`, `email`, `password_hash`, `is_active`, `email_verified_at`, `last_login_at`, `created_at`, `updated_at`) VALUES ('33333333-3333-3333-3333-333333333331', '3', 'ricamae.tupas@pembo.gov.ph', '$2y$12$6uk2k5P8lwGAZr1PtIAJV.VCCDimJrBn0H14qfY0zYKXB/ZESoNzG', '1', '2026-09-18 01:58:47', NULL, '2026-09-18 01:58:47', '2026-09-18 01:58:47');
INSERT INTO `users` (`id`, `role_id`, `email`, `password_hash`, `is_active`, `email_verified_at`, `last_login_at`, `created_at`, `updated_at`) VALUES ('33333333-3333-3333-3333-333333333332', '3', 'anabel.untong@pembo.gov.ph', '$2y$12$6uk2k5P8lwGAZr1PtIAJV.VCCDimJrBn0H14qfY0zYKXB/ZESoNzG', '1', '2026-09-18 01:58:47', NULL, '2026-09-18 01:58:47', '2026-09-18 01:58:47');

-- --------------------------------------------------------
-- Table structure for `resident_profiles`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `resident_profiles`;
CREATE TABLE `resident_profiles` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) NOT NULL,
  `suffix` varchar(20) DEFAULT NULL,
  `birthdate` date NOT NULL,
  `gender` enum('Male','Female','Other') NOT NULL,
  `civil_status` enum('Single','Married','Widowed','Separated','Divorced') NOT NULL,
  `contact_number` varchar(20) NOT NULL,
  `street_address` text NOT NULL,
  `voter_status` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `verification_status` enum('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `id_document_path` varchar(255) DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `verified_by` char(36) DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_resident_names` (`last_name`,`first_name`),
  CONSTRAINT `fk_resident_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `resident_profiles`
INSERT INTO `resident_profiles` (`id`, `user_id`, `first_name`, `middle_name`, `last_name`, `suffix`, `birthdate`, `gender`, `civil_status`, `contact_number`, `street_address`, `voter_status`, `created_at`, `updated_at`, `verification_status`, `id_document_path`, `rejection_reason`, `verified_by`, `verified_at`) VALUES ('57ba7710-f8b7-4782-82c6-5ee5dd9dc970', '33333333-3333-3333-3333-333333333332', 'Anabel', 'A.', 'Untong', 'None', '1996-10-22', 'Female', 'Single', '09281234567', 'Block 8 Lot 15, Rosal St., Barangay Pembo, Taguig City', '1', '2026-09-18 01:58:47', '2026-09-18 01:58:47', 'VERIFIED', NULL, NULL, '11111111-1111-1111-1111-111111111111', '2026-09-18 01:58:47');
INSERT INTO `resident_profiles` (`id`, `user_id`, `first_name`, `middle_name`, `last_name`, `suffix`, `birthdate`, `gender`, `civil_status`, `contact_number`, `street_address`, `voter_status`, `created_at`, `updated_at`, `verification_status`, `id_document_path`, `rejection_reason`, `verified_by`, `verified_at`) VALUES ('de083679-cfd6-43c0-b4e9-c45c603a3feb', '33333333-3333-3333-3333-333333333331', 'Rica Mae', 'A.', 'Tupas', 'None', '1998-05-14', 'Female', 'Single', '09171234567', 'Block 12 Lot 4, Sampaguita St., Barangay Pembo, Taguig City', '1', '2026-09-18 01:58:47', '2026-09-18 01:58:47', 'VERIFIED', NULL, NULL, '11111111-1111-1111-1111-111111111111', '2026-09-18 01:58:47');

-- --------------------------------------------------------
-- Table structure for `staff_profiles`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `staff_profiles`;
CREATE TABLE `staff_profiles` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `department` varchar(100) NOT NULL,
  `position` varchar(100) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `fk_staff_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `staff_profiles`
INSERT INTO `staff_profiles` (`id`, `user_id`, `first_name`, `last_name`, `department`, `position`, `created_at`, `updated_at`) VALUES ('99528b73-89a7-4948-ba48-b082904c70bb', '22222222-2222-2222-2222-222222222221', 'Amir', 'Abdulbayan', 'Administrative Operations', 'Barangay Staff / Desk Officer', '2026-09-18 01:58:47', '2026-09-18 01:58:47');
INSERT INTO `staff_profiles` (`id`, `user_id`, `first_name`, `last_name`, `department`, `position`, `created_at`, `updated_at`) VALUES ('eb4ed3dc-a4bc-415d-9f47-b7909839d6c4', '22222222-2222-2222-2222-222222222222', 'Christian', 'Baligod', 'Constituent Records & Services', 'Barangay Staff / Desk Officer', '2026-09-18 01:58:47', '2026-09-18 01:58:47');
INSERT INTO `staff_profiles` (`id`, `user_id`, `first_name`, `last_name`, `department`, `position`, `created_at`, `updated_at`) VALUES ('eca076cd-84e7-42b2-9356-7789786cb03b', '11111111-1111-1111-1111-111111111111', 'System', 'Administrator', 'Office of the Barangay Captain', 'Punong Barangay / Lead Admin', '2026-09-18 01:58:47', '2026-09-18 01:58:47');

-- --------------------------------------------------------
-- Table structure for `document_types`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `document_types`;
CREATE TABLE `document_types` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `base_fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `processing_days` int(11) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  CONSTRAINT `chk_base_fee` CHECK (`base_fee` >= 0),
  CONSTRAINT `chk_processing_days` CHECK (`processing_days` >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `document_types`
INSERT INTO `document_types` (`id`, `name`, `base_fee`, `processing_days`, `is_active`) VALUES ('1', 'Barangay Clearance', '50.00', '1', '1');
INSERT INTO `document_types` (`id`, `name`, `base_fee`, `processing_days`, `is_active`) VALUES ('2', 'Certificate of Residency', '50.00', '1', '1');
INSERT INTO `document_types` (`id`, `name`, `base_fee`, `processing_days`, `is_active`) VALUES ('3', 'Certificate of Indigency', '0.00', '1', '1');
INSERT INTO `document_types` (`id`, `name`, `base_fee`, `processing_days`, `is_active`) VALUES ('4', 'Barangay Business Clearance', '200.00', '3', '1');
INSERT INTO `document_types` (`id`, `name`, `base_fee`, `processing_days`, `is_active`) VALUES ('5', 'Community Tax Certificate (Cedula)', '100.00', '1', '1');

-- --------------------------------------------------------
-- Table structure for `document_requests`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `document_requests`;
CREATE TABLE `document_requests` (
  `id` char(36) NOT NULL,
  `tracking_number` varchar(32) NOT NULL,
  `resident_id` char(36) NOT NULL,
  `document_type_id` int(10) unsigned NOT NULL,
  `purpose` text NOT NULL,
  `status` enum('PENDING','VERIFYING','APPROVED','READY_FOR_PICKUP','COMPLETED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `rejection_reason` text DEFAULT NULL,
  `digital_document_url` varchar(500) DEFAULT NULL,
  `assigned_staff_id` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tracking_number` (`tracking_number`),
  KEY `idx_doc_requests_resident` (`resident_id`),
  KEY `idx_doc_requests_status` (`status`),
  KEY `fk_doc_req_type` (`document_type_id`),
  KEY `fk_doc_req_staff` (`assigned_staff_id`),
  KEY `idx_doc_requests_updated` (`updated_at`),
  CONSTRAINT `fk_doc_req_resident` FOREIGN KEY (`resident_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_doc_req_staff` FOREIGN KEY (`assigned_staff_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_doc_req_type` FOREIGN KEY (`document_type_id`) REFERENCES `document_types` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `request_attachments`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `request_attachments`;
CREATE TABLE `request_attachments` (
  `id` char(36) NOT NULL,
  `request_id` char(36) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size_bytes` bigint(20) unsigned NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_attachments_request_id` (`request_id`),
  CONSTRAINT `fk_attachments_request` FOREIGN KEY (`request_id`) REFERENCES `document_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `request_status_history`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `request_status_history`;
CREATE TABLE `request_status_history` (
  `id` char(36) NOT NULL,
  `request_id` char(36) NOT NULL,
  `previous_status` varchar(30) DEFAULT NULL,
  `new_status` varchar(30) NOT NULL,
  `remarks` text DEFAULT NULL,
  `changed_by` char(36) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_history_request` (`request_id`),
  KEY `fk_history_user` (`changed_by`),
  CONSTRAINT `fk_history_request` FOREIGN KEY (`request_id`) REFERENCES `document_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_history_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `appointments`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `appointments`;
CREATE TABLE `appointments` (
  `id` char(36) NOT NULL,
  `resident_id` char(36) NOT NULL,
  `service_type` varchar(100) NOT NULL,
  `appointment_date` date NOT NULL,
  `time_slot` varchar(50) NOT NULL,
  `status` enum('BOOKED','CONFIRMED','CANCELLED','ATTENDED','NO_SHOW') NOT NULL DEFAULT 'BOOKED',
  `cancellation_reason` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_resident_slot` (`resident_id`,`appointment_date`,`time_slot`),
  KEY `idx_appointments_date_slot` (`appointment_date`,`time_slot`),
  KEY `idx_appointments_updated` (`updated_at`),
  CONSTRAINT `fk_appointment_resident` FOREIGN KEY (`resident_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `complaints`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `complaints`;
CREATE TABLE `complaints` (
  `id` char(36) NOT NULL,
  `complaint_number` varchar(32) NOT NULL,
  `resident_id` char(36) NOT NULL,
  `incident_type` varchar(100) NOT NULL,
  `incident_location` text NOT NULL,
  `incident_date` datetime NOT NULL,
  `narrative_details` text NOT NULL,
  `status` enum('FILED','UNDER_INVESTIGATION','HEARING_SCHEDULED','RESOLVED','DISMISSED') NOT NULL DEFAULT 'FILED',
  `assigned_officer_id` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `complaint_number` (`complaint_number`),
  KEY `idx_complaints_status` (`status`),
  KEY `idx_complaints_resident` (`resident_id`),
  KEY `fk_complaints_officer` (`assigned_officer_id`),
  KEY `idx_complaints_updated` (`updated_at`),
  CONSTRAINT `fk_complaints_officer` FOREIGN KEY (`assigned_officer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_complaints_resident` FOREIGN KEY (`resident_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `complaint_updates`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `complaint_updates`;
CREATE TABLE `complaint_updates` (
  `id` char(36) NOT NULL,
  `complaint_id` char(36) NOT NULL,
  `staff_id` char(36) NOT NULL,
  `action_taken` varchar(100) NOT NULL,
  `hearing_date` datetime DEFAULT NULL,
  `resolution_notes` text NOT NULL,
  `status_at_update` varchar(30) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_complaint_updates_complaint_id` (`complaint_id`),
  KEY `fk_updates_staff` (`staff_id`),
  CONSTRAINT `fk_updates_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_updates_staff` FOREIGN KEY (`staff_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `emergency_sos`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `emergency_sos`;
CREATE TABLE `emergency_sos` (
  `id` char(36) NOT NULL,
  `sos_code` varchar(32) NOT NULL,
  `resident_id` char(36) NOT NULL,
  `emergency_type` enum('MEDICAL','FIRE','POLICE_SECURITY','NATURAL_DISASTER','OTHER') NOT NULL,
  `latitude` decimal(10,7) NOT NULL,
  `longitude` decimal(10,7) NOT NULL,
  `accuracy_meters` decimal(8,2) DEFAULT NULL,
  `status` enum('TRIGGERED','ACKNOWLEDGED','RESPONDERS_DISPATCHED','RESOLVED','FALSE_ALARM') NOT NULL DEFAULT 'TRIGGERED',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `resolved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sos_code` (`sos_code`),
  KEY `idx_emergency_sos_status` (`status`),
  KEY `idx_emergency_sos_created` (`created_at`),
  KEY `fk_emergency_resident` (`resident_id`),
  KEY `idx_emergency_sos_resolved_created` (`resolved_at`,`created_at`),
  CONSTRAINT `fk_emergency_resident` FOREIGN KEY (`resident_id`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_latitude` CHECK (`latitude` between -90.0000000 and 90.0000000),
  CONSTRAINT `chk_longitude` CHECK (`longitude` between -180.0000000 and 180.0000000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `emergency_dispatch_logs`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `emergency_dispatch_logs`;
CREATE TABLE `emergency_dispatch_logs` (
  `id` char(36) NOT NULL,
  `emergency_id` char(36) NOT NULL,
  `responder_team` varchar(100) NOT NULL,
  `dispatched_by` char(36) NOT NULL,
  `dispatch_time` datetime NOT NULL DEFAULT current_timestamp(),
  `arrival_time` datetime DEFAULT NULL,
  `clearance_time` datetime DEFAULT NULL,
  `action_notes` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dispatch_emergency_id` (`emergency_id`),
  KEY `fk_dispatch_user` (`dispatched_by`),
  CONSTRAINT `fk_dispatch_emergency` FOREIGN KEY (`emergency_id`) REFERENCES `emergency_sos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dispatch_user` FOREIGN KEY (`dispatched_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `assets`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `assets`;
CREATE TABLE `assets` (
  `id` char(36) NOT NULL,
  `asset_tag` varchar(100) NOT NULL,
  `name` varchar(200) NOT NULL,
  `category` varchar(100) NOT NULL,
  `total_quantity` int(10) unsigned NOT NULL,
  `available_quantity` int(10) unsigned NOT NULL,
  `item_condition` enum('NEW','GOOD','FAIR','DAMAGED','UNDER_MAINTENANCE') NOT NULL DEFAULT 'GOOD',
  `storage_location` varchar(150) NOT NULL,
  `version` int(10) unsigned NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `asset_tag` (`asset_tag`),
  KEY `idx_assets_category` (`category`),
  KEY `idx_assets_availability` (`available_quantity`),
  CONSTRAINT `chk_asset_availability` CHECK (`available_quantity` <= `total_quantity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `assets`
INSERT INTO `assets` (`id`, `asset_tag`, `name`, `category`, `total_quantity`, `available_quantity`, `item_condition`, `storage_location`, `version`, `created_at`, `updated_at`) VALUES ('32edd89a-d80f-4f3f-b101-fa637f758f01', 'AST-1001', 'Basketball', 'Sports Equipment', '50', '50', 'NEW', 'Storage room', '1', '2026-09-05 02:32:26', '2026-09-05 02:32:26');
INSERT INTO `assets` (`id`, `asset_tag`, `name`, `category`, `total_quantity`, `available_quantity`, `item_condition`, `storage_location`, `version`, `created_at`, `updated_at`) VALUES ('4063913d-eb96-45d5-ad29-f1e90db4f21f', 'AST-1003', 'Emergency Relief Shelter Tent', 'Relief Equipment', '5', '5', 'NEW', 'Hall Warehouse Zone A', '1', '2026-09-18 00:25:42', '2026-09-18 00:25:42');
INSERT INTO `assets` (`id`, `asset_tag`, `name`, `category`, `total_quantity`, `available_quantity`, `item_condition`, `storage_location`, `version`, `created_at`, `updated_at`) VALUES ('e053ba98-0c28-40c1-91a9-7e61add9785c', 'AST-1002', 'Emergency Relief Shelter Tent', 'Relief Equipment', '5', '5', 'NEW', 'Hall Warehouse Zone A', '1', '2026-09-18 00:17:08', '2026-09-18 00:17:08');
INSERT INTO `assets` (`id`, `asset_tag`, `name`, `category`, `total_quantity`, `available_quantity`, `item_condition`, `storage_location`, `version`, `created_at`, `updated_at`) VALUES ('e2562577-086c-48f6-ae50-fe24dd873055', 'AST-1004', 'Emergency Relief Shelter Tent', 'Relief Equipment', '5', '5', 'NEW', 'Hall Warehouse Zone A', '1', '2026-09-18 01:48:54', '2026-09-18 01:48:54');

-- --------------------------------------------------------
-- Table structure for `asset_transactions`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `asset_transactions`;
CREATE TABLE `asset_transactions` (
  `id` char(36) NOT NULL,
  `asset_id` char(36) NOT NULL,
  `borrower_name` varchar(150) NOT NULL,
  `borrower_contact` varchar(50) NOT NULL,
  `quantity_borrowed` int(10) unsigned NOT NULL,
  `issued_by` char(36) NOT NULL,
  `issued_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expected_return_date` date NOT NULL,
  `returned_at` datetime DEFAULT NULL,
  `received_by` char(36) DEFAULT NULL,
  `transaction_status` enum('BORROWED','RETURNED_COMPLETE','RETURNED_DAMAGED','OVERDUE','LOST') NOT NULL DEFAULT 'BORROWED',
  `remarks` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_asset_tx_status` (`transaction_status`),
  KEY `fk_tx_asset` (`asset_id`),
  KEY `fk_tx_issued_by` (`issued_by`),
  KEY `fk_tx_received_by` (`received_by`),
  CONSTRAINT `fk_tx_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`),
  CONSTRAINT `fk_tx_issued_by` FOREIGN KEY (`issued_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_tx_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_qty_borrowed` CHECK (`quantity_borrowed` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `over_the_counter_payments`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `over_the_counter_payments`;
CREATE TABLE `over_the_counter_payments` (
  `id` char(36) NOT NULL,
  `request_id` char(36) NOT NULL,
  `official_receipt_number` varchar(100) NOT NULL,
  `amount_paid` decimal(10,2) NOT NULL,
  `payment_status` enum('PAID','EXEMPTED','REFUNDED') NOT NULL DEFAULT 'PAID',
  `cashier_staff_id` char(36) NOT NULL,
  `paid_at` datetime NOT NULL DEFAULT current_timestamp(),
  `remarks` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_id` (`request_id`),
  UNIQUE KEY `official_receipt_number` (`official_receipt_number`),
  KEY `idx_payments_or_num` (`official_receipt_number`),
  KEY `fk_payment_cashier` (`cashier_staff_id`),
  CONSTRAINT `fk_payment_cashier` FOREIGN KEY (`cashier_staff_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_payment_request` FOREIGN KEY (`request_id`) REFERENCES `document_requests` (`id`),
  CONSTRAINT `chk_amount_paid` CHECK (`amount_paid` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `pending_registrations`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `pending_registrations`;
CREATE TABLE `pending_registrations` (
  `id` char(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) NOT NULL,
  `suffix` varchar(20) DEFAULT NULL,
  `birthdate` date NOT NULL,
  `gender` enum('Male','Female','Other') NOT NULL,
  `civil_status` enum('Single','Married','Widowed','Separated','Divorced') NOT NULL,
  `street_address` text NOT NULL,
  `verification_code_hash` varchar(255) NOT NULL,
  `code_expires_at` datetime NOT NULL,
  `verify_attempts` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id_document_path` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_pending_email` (`email`),
  KEY `idx_pending_expiry` (`code_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `password_resets`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `password_resets`;
CREATE TABLE `password_resets` (
  `id` char(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `verification_code_hash` varchar(255) NOT NULL,
  `reset_token_hash` varchar(255) DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `code_expires_at` datetime NOT NULL,
  `verify_attempts` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_pwreset_email` (`email`),
  KEY `idx_pwreset_expiry` (`code_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `system_settings`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `system_settings`;
CREATE TABLE `system_settings` (
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `updated_by` char(36) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `system_settings`
INSERT INTO `system_settings` (`setting_key`, `setting_value`, `description`, `updated_by`, `updated_at`) VALUES ('office_hours', 'Mon-Sat 8:00 AM - 6:00 PM', NULL, '11111111-1111-1111-1111-111111111111', '2026-09-18 01:48:54');
INSERT INTO `system_settings` (`setting_key`, `setting_value`, `description`, `updated_by`, `updated_at`) VALUES ('test_setting', 'ActiveValue', NULL, '11111111-1111-1111-1111-111111111111', '2026-09-18 01:48:54');

-- --------------------------------------------------------
-- Table structure for `audit_logs`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` char(36) DEFAULT NULL,
  `ip_address` varchar(45) NOT NULL,
  `user_agent` text DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `table_name` varchar(100) NOT NULL,
  `record_id` varchar(100) NOT NULL,
  `old_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_values`)),
  `new_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_values`)),
  `timestamp` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_user` (`user_id`),
  KEY `idx_audit_logs_action` (`action`),
  KEY `idx_audit_logs_timestamp` (`timestamp`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=83 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `audit_logs`
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('1', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'TAMPERED', 'users', '8e75d1b4-47fe-4a0f-b62c-f8e2144c7be8', NULL, '{\"email\":\"enochdevvv@gmail.com\",\"department\":\"Secretary\",\"position\":\"Document\"}', '2026-09-18 00:50:43');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('2', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'DEACTIVATE_STAFF_ACCOUNT', 'users', '8e75d1b4-47fe-4a0f-b62c-f8e2144c7be8', '{\"is_active\":1}', '{\"is_active\":0}', '2026-09-18 00:51:16');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('3', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGOUT', 'users', '11111111-1111-1111-1111-111111111111', NULL, NULL, '2026-09-18 00:51:17');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('4', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', 'e8c4cb3d-c613-450a-a153-f538f45c7a84', NULL, '{\"email\":\"resident_1789663897_639@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 00:51:38');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('5', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', '4a34c7db-92a1-4d29-9dfa-410ecb2bc820', NULL, '{\"email\":\"duplicate_1789663898@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 00:51:38');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('6', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', 'd495aad6-a2ec-40ab-bb41-447c7e1e5043', NULL, '{\"email\":\"pwreset_1789663898@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 00:51:39');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('7', NULL, '127.0.0.1', 'CLI/System', 'PASSWORD_RESET', 'users', 'd495aad6-a2ec-40ab-bb41-447c7e1e5043', NULL, NULL, '2026-09-18 00:51:40');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('8', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'LOGIN', 'users', '11111111-1111-1111-1111-111111111111', NULL, '{\"email\":\"admin@pembo.gov.ph\",\"role\":\"ADMIN\"}', '2026-09-18 00:51:40');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('9', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', '211ea7f5-6c0f-4a46-9019-3c2cc00181c3', NULL, '{\"email\":\"pending_gate_1789663901@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 00:51:41');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('10', NULL, '127.0.0.1', 'CLI/System', 'LOGIN', 'users', '211ea7f5-6c0f-4a46-9019-3c2cc00181c3', NULL, '{\"email\":\"pending_gate_1789663901@pembo.gov.ph\",\"role\":\"RESIDENT\"}', '2026-09-18 00:51:42');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('11', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGIN', 'users', '11111111-1111-1111-1111-111111111111', NULL, '{\"email\":\"admin@pembo.gov.ph\",\"role\":\"ADMIN\"}', '2026-09-18 00:51:52');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('12', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'CREATE_STAFF_ACCOUNT', 'users', '006f603f-42a5-4df1-aeda-43854effc1b6', NULL, '{\"email\":\"enochdevvv@gmail.com\",\"department\":\"inok\",\"position\":\"inok\"}', '2026-09-18 00:56:13');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('13', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGOUT', 'users', '11111111-1111-1111-1111-111111111111', NULL, NULL, '2026-09-18 00:56:15');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('14', NULL, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGIN', 'users', '006f603f-42a5-4df1-aeda-43854effc1b6', NULL, '{\"email\":\"enochdevvv@gmail.com\",\"role\":\"STAFF\"}', '2026-09-18 00:56:25');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('15', NULL, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGOUT', 'users', '006f603f-42a5-4df1-aeda-43854effc1b6', NULL, NULL, '2026-09-18 00:56:35');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('16', NULL, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'REGISTER', 'users', '042c18f0-a9da-4135-abe9-a56795102b26', NULL, '{\"email\":\"charosdental@gmail.com\",\"role\":\"RESIDENT\",\"first_name\":\"Enoch\",\"last_name\":\"Astor\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:07:24');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('17', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', 'f1ad4513-0109-477f-95d5-c5ce444bcaf9', NULL, '{\"email\":\"resident_1789665170_496@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:12:51');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('18', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', '2e79d2bb-78a9-4cac-8c14-7ceefe42a267', NULL, '{\"email\":\"duplicate_1789665171@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:12:52');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('19', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', '67e9a7f2-43ff-4952-9338-2697c22053d6', NULL, '{\"email\":\"pwreset_1789665172@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:12:52');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('20', NULL, '127.0.0.1', 'CLI/System', 'PASSWORD_RESET', 'users', '67e9a7f2-43ff-4952-9338-2697c22053d6', NULL, NULL, '2026-09-18 01:12:53');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('21', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'LOGIN', 'users', '11111111-1111-1111-1111-111111111111', NULL, '{\"email\":\"admin@pembo.gov.ph\",\"role\":\"ADMIN\"}', '2026-09-18 01:12:53');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('22', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', 'c3746676-f5a3-4937-bd43-0ed20fa00637', NULL, '{\"email\":\"pending_gate_1789665174@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:12:54');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('23', NULL, '127.0.0.1', 'CLI/System', 'LOGIN', 'users', 'c3746676-f5a3-4937-bd43-0ed20fa00637', NULL, '{\"email\":\"pending_gate_1789665174@pembo.gov.ph\",\"role\":\"RESIDENT\"}', '2026-09-18 01:12:55');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('24', NULL, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGIN', 'users', '006f603f-42a5-4df1-aeda-43854effc1b6', NULL, '{\"email\":\"enochdevvv@gmail.com\",\"role\":\"STAFF\"}', '2026-09-18 01:14:15');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('25', NULL, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'VERIFY_RESIDENT_ACCOUNT', 'resident_profiles', '9842e837-f3fb-49fa-95b4-b7dac6ce94c6', '{\"previous_status\":\"PENDING\"}', '{\"new_status\":\"VERIFIED\",\"reason\":\"\"}', '2026-09-18 01:14:41');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('27', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGIN', 'users', '11111111-1111-1111-1111-111111111111', NULL, '{\"email\":\"admin@pembo.gov.ph\",\"role\":\"ADMIN\"}', '2026-09-18 01:16:44');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('28', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'CREATE_STAFF_ACCOUNT', 'users', '4d19e4ef-8881-4552-a561-6535c4c94a8a', NULL, '{\"email\":\"enochdevvv@gmail.com\",\"department\":\"Nyayw\",\"position\":\"Nyaw\"}', '2026-09-18 01:17:06');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('29', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGOUT', 'users', '11111111-1111-1111-1111-111111111111', NULL, NULL, '2026-09-18 01:17:07');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('30', '5de12c23-0565-400b-814e-89be8e9e6b3d', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'REGISTER', 'users', '5de12c23-0565-400b-814e-89be8e9e6b3d', NULL, '{\"email\":\"charosdental@gmail.com\",\"role\":\"RESIDENT\",\"first_name\":\"Althea\",\"last_name\":\"Santillan\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:18:54');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('31', '4d19e4ef-8881-4552-a561-6535c4c94a8a', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGIN', 'users', '4d19e4ef-8881-4552-a561-6535c4c94a8a', NULL, '{\"email\":\"enochdevvv@gmail.com\",\"role\":\"STAFF\"}', '2026-09-18 01:19:24');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('32', '4d19e4ef-8881-4552-a561-6535c4c94a8a', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'VERIFY_RESIDENT_ACCOUNT', 'resident_profiles', '3b12614d-3b92-4a4a-906f-80f224c2365b', '{\"previous_status\":\"PENDING\"}', '{\"new_status\":\"VERIFIED\",\"reason\":\"\"}', '2026-09-18 01:19:52');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('33', '4d19e4ef-8881-4552-a561-6535c4c94a8a', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGOUT', 'users', '4d19e4ef-8881-4552-a561-6535c4c94a8a', NULL, NULL, '2026-09-18 01:20:00');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('34', '91ab0dcc-81ce-4878-a71f-e18afe734d19', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'REGISTER', 'users', '91ab0dcc-81ce-4878-a71f-e18afe734d19', NULL, '{\"email\":\"enocjastor@gmail.com\",\"role\":\"RESIDENT\",\"first_name\":\"Zhian\",\"last_name\":\"Santillan\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:21:28');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('35', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGIN', 'users', '11111111-1111-1111-1111-111111111111', NULL, '{\"email\":\"admin@pembo.gov.ph\",\"role\":\"ADMIN\"}', '2026-09-18 01:21:52');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('36', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'VERIFY_RESIDENT_ACCOUNT', 'resident_profiles', 'b7bc9e53-ddca-43d3-8944-f3909a383328', '{\"previous_status\":\"PENDING\"}', '{\"new_status\":\"VERIFIED\",\"reason\":\"\"}', '2026-09-18 01:22:05');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('37', '11111111-1111-1111-1111-111111111111', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGOUT', 'users', '11111111-1111-1111-1111-111111111111', NULL, NULL, '2026-09-18 01:22:12');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('38', '91ab0dcc-81ce-4878-a71f-e18afe734d19', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGIN', 'users', '91ab0dcc-81ce-4878-a71f-e18afe734d19', NULL, '{\"email\":\"enocjastor@gmail.com\",\"role\":\"RESIDENT\"}', '2026-09-18 01:22:22');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('39', '91ab0dcc-81ce-4878-a71f-e18afe734d19', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'CREATE_DOCUMENT_REQUEST', 'document_requests', '1c9b3b05-446e-418a-9207-15d22846419b', NULL, '{\"tracking_number\":\"PEM-20260917-DE4544\",\"document_type\":\"Barangay Clearance\",\"has_attachment\":true}', '2026-09-18 01:22:37');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('40', '91ab0dcc-81ce-4878-a71f-e18afe734d19', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'CREATE_APPOINTMENT', 'appointments', '5af5b6ad-5dd1-487d-8783-6b3ded429e88', NULL, '{\"service_type\":\"Blotter \\/ Complaint Filing\",\"appointment_date\":\"2026-09-18\",\"time_slot\":\"09:00-10:00\"}', '2026-09-18 01:22:55');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('41', '91ab0dcc-81ce-4878-a71f-e18afe734d19', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'CREATE_COMPLAINT', 'complaints', '1f45f55d-cd5e-4c32-a016-34d262d19708', NULL, '{\"complaint_number\":\"CMP-20260917-4525CA\",\"incident_type\":\"Noise Disturbance\"}', '2026-09-18 01:23:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('42', '91ab0dcc-81ce-4878-a71f-e18afe734d19', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'TRIGGER_SOS', 'emergency_sos', 'bc76e74c-8244-41e3-a76e-76157304a5ae', NULL, '{\"sos_code\":\"SOS-20260917-E9512C\",\"type\":\"MEDICAL\",\"latitude\":14.559693617999168,\"longitude\":121.04709518303237}', '2026-09-18 01:25:19');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('43', '91ab0dcc-81ce-4878-a71f-e18afe734d19', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'TRIGGER_SOS', 'emergency_sos', 'f1724b50-5e8f-4571-b172-59e187c27a82', NULL, '{\"sos_code\":\"SOS-20260917-0B75C7\",\"type\":\"MEDICAL\",\"latitude\":14.559693617999168,\"longitude\":121.04709518303237}', '2026-09-18 01:25:29');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('44', '91ab0dcc-81ce-4878-a71f-e18afe734d19', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGOUT', 'users', '91ab0dcc-81ce-4878-a71f-e18afe734d19', NULL, NULL, '2026-09-18 01:42:03');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('45', '5de12c23-0565-400b-814e-89be8e9e6b3d', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGIN', 'users', '5de12c23-0565-400b-814e-89be8e9e6b3d', NULL, '{\"email\":\"charosdental@gmail.com\",\"role\":\"RESIDENT\"}', '2026-09-18 01:42:17');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('46', '9b6345d7-75e7-4947-8c8a-748b7f22004b', '127.0.0.1', 'CLI/System', 'REGISTER', 'users', '9b6345d7-75e7-4947-8c8a-748b7f22004b', NULL, '{\"email\":\"resident_1789667146_714@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:45:47');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('47', '95120c60-c12c-45a7-9b53-f7c042501d4a', '127.0.0.1', 'CLI/System', 'REGISTER', 'users', '95120c60-c12c-45a7-9b53-f7c042501d4a', NULL, '{\"email\":\"duplicate_1789667147@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:45:48');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('48', '8d62d45f-96a8-4693-b6aa-393038d6e099', '127.0.0.1', 'CLI/System', 'REGISTER', 'users', '8d62d45f-96a8-4693-b6aa-393038d6e099', NULL, '{\"email\":\"pwreset_1789667148@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:45:48');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('49', '8d62d45f-96a8-4693-b6aa-393038d6e099', '127.0.0.1', 'CLI/System', 'PASSWORD_RESET', 'users', '8d62d45f-96a8-4693-b6aa-393038d6e099', NULL, NULL, '2026-09-18 01:45:49');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('50', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'LOGIN', 'users', '11111111-1111-1111-1111-111111111111', NULL, '{\"email\":\"admin@pembo.gov.ph\",\"role\":\"ADMIN\"}', '2026-09-18 01:45:49');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('51', 'add8806b-65b8-45f6-a67c-827446f6d782', '127.0.0.1', 'CLI/System', 'REGISTER', 'users', 'add8806b-65b8-45f6-a67c-827446f6d782', NULL, '{\"email\":\"pending_gate_1789667150@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Test\",\"last_name\":\"Resident\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:45:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('52', 'add8806b-65b8-45f6-a67c-827446f6d782', '127.0.0.1', 'CLI/System', 'LOGIN', 'users', 'add8806b-65b8-45f6-a67c-827446f6d782', NULL, '{\"email\":\"pending_gate_1789667150@pembo.gov.ph\",\"role\":\"RESIDENT\"}', '2026-09-18 01:45:51');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('53', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'LOGIN', 'users', '11111111-1111-1111-1111-111111111111', NULL, '{\"email\":\"admin@pembo.gov.ph\",\"role\":\"ADMIN\"}', '2026-09-18 01:48:21');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('54', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', 'ec896d06-e3fe-4410-b5d9-7966430f398a', NULL, '{\"email\":\"appt_resident_a_1789667301_1495@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Appt\",\"last_name\":\"ResidentA\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:48:21');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('55', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', '8efcf7bc-d166-421d-acd6-0bcfd0c90d0e', NULL, '{\"email\":\"appt_resident_b_1789667301_8960@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Appt\",\"last_name\":\"ResidentB\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:48:22');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('56', NULL, '127.0.0.1', 'CLI/System', 'CREATE_APPOINTMENT', 'appointments', 'a86bd4c5-2f9b-4679-9af5-cdb1c249b9c6', NULL, '{\"service_type\":\"Barangay Clearance Appointment\",\"appointment_date\":\"2026-09-18\",\"time_slot\":\"09:00-10:00\"}', '2026-09-18 01:48:22');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('57', NULL, '127.0.0.1', 'CLI/System', 'CREATE_APPOINTMENT', 'appointments', '4a4e1952-478c-445b-a3b5-675e3798f670', NULL, '{\"service_type\":\"Different person booking\",\"appointment_date\":\"2026-09-18\",\"time_slot\":\"09:00-10:00\"}', '2026-09-18 01:48:22');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('58', NULL, '127.0.0.1', 'CLI/System', 'CREATE_APPOINTMENT', 'appointments', '65fa0689-603d-40b2-b110-0afb8da7ceff', NULL, '{\"service_type\":\"Status update test\",\"appointment_date\":\"2026-09-19\",\"time_slot\":\"10:00-11:00\"}', '2026-09-18 01:48:22');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('59', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'UPDATE_APPOINTMENT_STATUS', 'appointments', '65fa0689-603d-40b2-b110-0afb8da7ceff', '{\"previous_status\":\"BOOKED\"}', '{\"new_status\":\"CONFIRMED\"}', '2026-09-18 01:48:22');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('60', NULL, '127.0.0.1', 'CLI/System', 'CREATE_APPOINTMENT', 'appointments', '729a2619-446f-439a-889c-83751d283013', NULL, '{\"service_type\":\"Cancellation test\",\"appointment_date\":\"2026-09-20\",\"time_slot\":\"11:00-12:00\"}', '2026-09-18 01:48:22');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('61', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'UPDATE_APPOINTMENT_STATUS', 'appointments', '729a2619-446f-439a-889c-83751d283013', '{\"previous_status\":\"BOOKED\"}', '{\"new_status\":\"CANCELLED\"}', '2026-09-18 01:48:22');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('62', NULL, '127.0.0.1', 'CLI/System', 'CREATE_APPOINTMENT', 'appointments', '684aa8ec-0321-40d2-9cea-119e40ffc7e9', NULL, '{\"service_type\":\"Audit capture\",\"appointment_date\":\"2026-09-21\",\"time_slot\":\"13:00-14:00\"}', '2026-09-18 01:48:22');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('63', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'LOGIN', 'users', '11111111-1111-1111-1111-111111111111', NULL, '{\"email\":\"admin@pembo.gov.ph\",\"role\":\"ADMIN\"}', '2026-09-18 01:48:49');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('64', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', '0408cc06-3482-407b-92ac-5f5d53d3c715', NULL, '{\"email\":\"appt_resident_a_1789667329_8025@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Appt\",\"last_name\":\"ResidentA\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:48:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('65', NULL, '127.0.0.1', 'CLI/System', 'REGISTER', 'users', '665f5d04-113f-4574-9270-287518775035', NULL, '{\"email\":\"appt_resident_b_1789667330_1019@pembo.gov.ph\",\"role\":\"RESIDENT\",\"first_name\":\"Appt\",\"last_name\":\"ResidentB\",\"verification_status\":\"PENDING\"}', '2026-09-18 01:48:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('66', NULL, '127.0.0.1', 'CLI/System', 'CREATE_APPOINTMENT', 'appointments', '79960177-d5f9-40f3-b8d6-2d92767975d3', NULL, '{\"service_type\":\"Barangay Clearance Appointment\",\"appointment_date\":\"2027-05-17\",\"time_slot\":\"09:00-10:00\"}', '2026-09-18 01:48:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('67', NULL, '127.0.0.1', 'CLI/System', 'CREATE_APPOINTMENT', 'appointments', 'afca99d7-8402-42b7-928d-02f381213eab', NULL, '{\"service_type\":\"Different person booking\",\"appointment_date\":\"2027-05-17\",\"time_slot\":\"09:00-10:00\"}', '2026-09-18 01:48:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('68', NULL, '127.0.0.1', 'CLI/System', 'CREATE_APPOINTMENT', 'appointments', 'feb4805f-377b-4879-80c9-89a763efe835', NULL, '{\"service_type\":\"Status update test\",\"appointment_date\":\"2026-09-19\",\"time_slot\":\"10:00-11:00\"}', '2026-09-18 01:48:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('69', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'UPDATE_APPOINTMENT_STATUS', 'appointments', 'feb4805f-377b-4879-80c9-89a763efe835', '{\"previous_status\":\"BOOKED\"}', '{\"new_status\":\"CONFIRMED\"}', '2026-09-18 01:48:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('70', NULL, '127.0.0.1', 'CLI/System', 'CREATE_APPOINTMENT', 'appointments', '7b8c145b-41be-418f-9669-41ab74f531aa', NULL, '{\"service_type\":\"Cancellation test\",\"appointment_date\":\"2026-09-20\",\"time_slot\":\"11:00-12:00\"}', '2026-09-18 01:48:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('71', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'UPDATE_APPOINTMENT_STATUS', 'appointments', '7b8c145b-41be-418f-9669-41ab74f531aa', '{\"previous_status\":\"BOOKED\"}', '{\"new_status\":\"CANCELLED\"}', '2026-09-18 01:48:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('72', NULL, '127.0.0.1', 'CLI/System', 'CREATE_APPOINTMENT', 'appointments', '3f9561fc-b876-46cb-9b76-73795f5ffe9c', NULL, '{\"service_type\":\"Audit capture\",\"appointment_date\":\"2026-09-21\",\"time_slot\":\"13:00-14:00\"}', '2026-09-18 01:48:50');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('73', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'LOGIN', 'users', '11111111-1111-1111-1111-111111111111', NULL, '{\"email\":\"admin@pembo.gov.ph\",\"role\":\"ADMIN\"}', '2026-09-18 01:48:53');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('74', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'CREATE_STAFF_ACCOUNT', 'users', 'be05d684-2994-4a70-937f-b88b80bfabdb', NULL, '{\"email\":\"new_staff_1789667333_499@pembo.gov.ph\",\"department\":\"Records & Verification\",\"position\":\"Desk Officer\"}', '2026-09-18 01:48:54');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('75', 'be05d684-2994-4a70-937f-b88b80bfabdb', '127.0.0.1', 'CLI/System', 'LOGIN', 'users', 'be05d684-2994-4a70-937f-b88b80bfabdb', NULL, '{\"email\":\"new_staff_1789667333_499@pembo.gov.ph\",\"role\":\"STAFF\"}', '2026-09-18 01:48:54');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('76', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'DEACTIVATE_STAFF_ACCOUNT', 'users', '4d19e4ef-8881-4552-a561-6535c4c94a8a', '{\"is_active\":1}', '{\"is_active\":0}', '2026-09-18 01:48:54');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('77', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'ACTIVATE_STAFF_ACCOUNT', 'users', '4d19e4ef-8881-4552-a561-6535c4c94a8a', '{\"is_active\":0}', '{\"is_active\":1}', '2026-09-18 01:48:54');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('78', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'CREATE_ASSET', 'assets', 'e2562577-086c-48f6-ae50-fe24dd873055', NULL, '{\"asset_tag\":\"AST-1004\",\"name\":\"Emergency Relief Shelter Tent\",\"total_qty\":5}', '2026-09-18 01:48:54');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('79', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'ISSUE_ASSET', 'asset_transactions', 'bc0c1864-fb39-4bbb-be2d-103e2e664a59', NULL, '{\"asset_id\":\"e2562577-086c-48f6-ae50-fe24dd873055\",\"borrower_name\":\"Juan Dela Cruz\",\"qty\":2}', '2026-09-18 01:48:54');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('80', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'RETURN_ASSET', 'asset_transactions', 'bc0c1864-fb39-4bbb-be2d-103e2e664a59', '{\"previous_status\":\"BORROWED\"}', '{\"new_status\":\"RETURNED_COMPLETE\"}', '2026-09-18 01:48:54');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('81', '11111111-1111-1111-1111-111111111111', '127.0.0.1', 'CLI/System', 'UPDATE_SYSTEM_SETTINGS', 'system_settings', 'GLOBAL', NULL, '{\"office_hours\":\"Mon-Sat 8:00 AM - 6:00 PM\",\"test_setting\":\"ActiveValue\"}', '2026-09-18 01:48:54');
INSERT INTO `audit_logs` (`id`, `user_id`, `ip_address`, `user_agent`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`) VALUES ('82', '5de12c23-0565-400b-814e-89be8e9e6b3d', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'LOGOUT', 'users', '5de12c23-0565-400b-814e-89be8e9e6b3d', NULL, NULL, '2026-09-18 01:51:25');

-- --------------------------------------------------------
-- Audit Log Immutability Triggers
-- --------------------------------------------------------
DROP TRIGGER IF EXISTS `trg_prevent_audit_update`;
DELIMITER $$
CREATE TRIGGER `trg_prevent_audit_update` BEFORE UPDATE ON `audit_logs`
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are immutable and cannot be modified.';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_prevent_audit_delete`;
DELIMITER $$
CREATE TRIGGER `trg_prevent_audit_delete` BEFORE DELETE ON `audit_logs`
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are immutable and cannot be deleted.';
END$$
DELIMITER ;

SET FOREIGN_KEY_CHECKS = 1;
