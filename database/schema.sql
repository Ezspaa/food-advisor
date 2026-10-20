-- =====================================================================
--  Food Advisor — MySQL schema
--  F28JC Web Programming · CW1.2 · CE 202 Group 4
--
--  Run through `npm run db:setup` (database/setup.js), which creates the
--  database, executes this file and inserts the sample data.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS review_reports;
DROP TABLE IF EXISTS review_votes;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS dishes;
DROP TABLE IF EXISTS restaurants;
DROP TABLE IF EXISTS cuisines;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Users: one table for all three roles (FR1, FR6, FR11)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(80)  NOT NULL,
  email         VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,          -- scrypt$<salt>$<hash>
  role          ENUM('customer','owner','admin') NOT NULL DEFAULT 'customer',
  status        ENUM('active','blocked')         NOT NULL DEFAULT 'active',
  city          VARCHAR(60)  NULL,
  bio           VARCHAR(300) NULL,
  avatar_url    VARCHAR(500) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Login sessions: only a SHA-256 hash of the bearer token is stored
-- ---------------------------------------------------------------------
CREATE TABLE sessions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64)     NOT NULL,
  expires_at  DATETIME     NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Cuisines: lookup table used by search filters (FR2)
-- ---------------------------------------------------------------------
CREATE TABLE cuisines (
  id     SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name   VARCHAR(40) NOT NULL,
  emoji  VARCHAR(8)  NOT NULL DEFAULT '🍽️',
  UNIQUE KEY uq_cuisines_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Restaurants (FR3, FR8, FR12)
--   status: owners create restaurants as 'pending'; an admin approves them
-- ---------------------------------------------------------------------
CREATE TABLE restaurants (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id     INT UNSIGNED NULL,
  cuisine_id   SMALLINT UNSIGNED NOT NULL,
  name         VARCHAR(100) NOT NULL,
  description  TEXT NULL,
  city         VARCHAR(60)  NOT NULL,
  address      VARCHAR(160) NOT NULL,
  phone        VARCHAR(30)  NULL,
  website      VARCHAR(200) NULL,
  price_level  TINYINT UNSIGNED NOT NULL DEFAULT 2,   -- 1 (₸) .. 4 (₸₸₸₸)
  opens_at     TIME NULL,
  closes_at    TIME NULL,
  image_url    VARCHAR(500) NULL,
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  is_featured  TINYINT(1) NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_restaurants_price CHECK (price_level BETWEEN 1 AND 4),
  KEY idx_restaurants_city (city),
  KEY idx_restaurants_cuisine (cuisine_id),
  KEY idx_restaurants_status (status),
  KEY idx_restaurants_price (price_level),
  KEY idx_restaurants_owner (owner_id),
  KEY idx_restaurants_name (name),
  CONSTRAINT fk_restaurants_owner   FOREIGN KEY (owner_id)   REFERENCES users(id)    ON DELETE SET NULL,
  CONSTRAINT fk_restaurants_cuisine FOREIGN KEY (cuisine_id) REFERENCES cuisines(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Dishes / menu items (FR3, FR9)
-- ---------------------------------------------------------------------
CREATE TABLE dishes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id  INT UNSIGNED NOT NULL,
  name           VARCHAR(100) NOT NULL,
  description    VARCHAR(400) NULL,
  category       ENUM('Starters','Mains','Sides','Desserts','Drinks') NOT NULL DEFAULT 'Mains',
  price          DECIMAL(10,2) NOT NULL,
  image_url      VARCHAR(500) NULL,
  is_vegetarian  TINYINT(1) NOT NULL DEFAULT 0,
  is_spicy       TINYINT(1) NOT NULL DEFAULT 0,
  is_available   TINYINT(1) NOT NULL DEFAULT 1,
  -- nutrition facts per portion (all optional)
  weight_g       SMALLINT UNSIGNED NULL,
  calories       SMALLINT UNSIGNED NULL,
  protein_g      DECIMAL(5,1) NULL,
  fat_g          DECIMAL(5,1) NULL,
  carbs_g        DECIMAL(5,1) NULL,
  allergens      SET('gluten','dairy','eggs','nuts','fish','shellfish','soy','sesame') NOT NULL DEFAULT '',
  recommended_for SET('kids','sharing','sport','light','halal','vegan','gluten_free') NOT NULL DEFAULT '',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_dishes_price CHECK (price >= 0),
  KEY idx_dishes_restaurant (restaurant_id),
  KEY idx_dishes_name (name),
  KEY idx_dishes_price (price),
  KEY idx_dishes_calories (calories),
  CONSTRAINT fk_dishes_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Reviews (FR4, FR5, FR10, FR13)
--   one review per customer per restaurant; admins can hide a review
-- ---------------------------------------------------------------------
CREATE TABLE reviews (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id   INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  rating          TINYINT UNSIGNED NOT NULL,
  title           VARCHAR(100) NOT NULL,
  comment         TEXT NOT NULL,
  visit_date      DATE NULL,
  owner_reply     VARCHAR(600) NULL,
  owner_reply_at  DATETIME NULL,
  status          ENUM('visible','hidden') NOT NULL DEFAULT 'visible',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  UNIQUE KEY uq_reviews_user_restaurant (restaurant_id, user_id),
  KEY idx_reviews_restaurant_status (restaurant_id, status),
  KEY idx_reviews_user (user_id),
  KEY idx_reviews_created (created_at),
  CONSTRAINT fk_reviews_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_user       FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- "Helpful" votes on reviews (extra feature)
-- ---------------------------------------------------------------------
CREATE TABLE review_votes (
  review_id   INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id, user_id),
  CONSTRAINT fk_votes_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Reports of inappropriate reviews -> admin moderation queue (FR13)
-- ---------------------------------------------------------------------
CREATE TABLE review_reports (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  review_id    INT UNSIGNED NOT NULL,
  reporter_id  INT UNSIGNED NOT NULL,
  reason       ENUM('spam','offensive','fake','off-topic','other') NOT NULL,
  details      VARCHAR(300) NULL,
  status       ENUM('open','resolved','dismissed') NOT NULL DEFAULT 'open',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at  DATETIME NULL,
  UNIQUE KEY uq_reports_review_reporter (review_id, reporter_id),
  KEY idx_reports_status (status),
  CONSTRAINT fk_reports_review   FOREIGN KEY (review_id)   REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Favourites saved to the account (FR7; guests keep them in localStorage)
-- ---------------------------------------------------------------------
CREATE TABLE favorites (
  user_id        INT UNSIGNED NOT NULL,
  restaurant_id  INT UNSIGNED NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, restaurant_id),
  CONSTRAINT fk_fav_user       FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
  CONSTRAINT fk_fav_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Site feedback from testers / visitors (floating "Feedback" button)
-- ---------------------------------------------------------------------
CREATE TABLE feedback (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NULL,
  rating      TINYINT UNSIGNED NOT NULL,
  category    ENUM('design','usability','bug','idea','other') NOT NULL DEFAULT 'other',
  message     VARCHAR(1000) NOT NULL,
  email       VARCHAR(120) NULL,
  page        VARCHAR(200) NULL,
  device      ENUM('mobile','tablet','desktop') NULL,
  status      ENUM('new','read') NOT NULL DEFAULT 'new',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5),
  KEY idx_feedback_status (status),
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
