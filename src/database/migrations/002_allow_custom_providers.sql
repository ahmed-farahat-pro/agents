-- =====================================================
-- Migration: Allow Custom Provider Keys
-- Removes foreign key constraints to support custom provider keys
-- =====================================================

USE nigents;

-- Drop foreign key constraints if they exist
SET @constraint_name = (
    SELECT CONSTRAINT_NAME 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_NAME = 'agent_configurations' 
    AND COLUMN_NAME = 'provider_id' 
    AND REFERENCED_TABLE_NAME IS NOT NULL
    LIMIT 1
);

SET @sql = IF(@constraint_name IS NOT NULL, 
    CONCAT('ALTER TABLE agent_configurations DROP FOREIGN KEY ', @constraint_name),
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop other foreign key constraints
SET @constraint_name = (
    SELECT CONSTRAINT_NAME 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_NAME = 'agent_configurations' 
    AND COLUMN_NAME = 'model_id' 
    AND REFERENCED_TABLE_NAME IS NOT NULL
    LIMIT 1
);

SET @sql = IF(@constraint_name IS NOT NULL, 
    CONCAT('ALTER TABLE agent_configurations DROP FOREIGN KEY ', @constraint_name),
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @constraint_name = (
    SELECT CONSTRAINT_NAME 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_NAME = 'agent_configurations' 
    AND COLUMN_NAME = 'fallback_provider_id' 
    AND REFERENCED_TABLE_NAME IS NOT NULL
    LIMIT 1
);

SET @sql = IF(@constraint_name IS NOT NULL, 
    CONCAT('ALTER TABLE agent_configurations DROP FOREIGN KEY ', @constraint_name),
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @constraint_name = (
    SELECT CONSTRAINT_NAME 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_NAME = 'agent_configurations' 
    AND COLUMN_NAME = 'fallback_model_id' 
    AND REFERENCED_TABLE_NAME IS NOT NULL
    LIMIT 1
);

SET @sql = IF(@constraint_name IS NOT NULL, 
    CONCAT('ALTER TABLE agent_configurations DROP FOREIGN KEY ', @constraint_name),
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Alter columns to support longer custom provider keys
ALTER TABLE agent_configurations 
    MODIFY COLUMN provider_id VARCHAR(100),
    MODIFY COLUMN model_id VARCHAR(100),
    MODIFY COLUMN fallback_provider_id VARCHAR(100),
    MODIFY COLUMN fallback_model_id VARCHAR(100);

-- Add index for performance
CREATE INDEX idx_provider_id ON agent_configurations(provider_id);

SELECT 'Migration complete: Custom provider keys are now supported' AS message;
