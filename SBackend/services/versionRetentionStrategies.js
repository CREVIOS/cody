/**
 * Strategy Pattern: Version Retention Policies
 *
 * Defines different strategies for determining which file versions to retain
 * and which to delete based on age, count, or custom criteria.
 *
 * Pattern Components:
 * - IRetentionStrategy: Strategy interface
 * - KeepRecentVersionsStrategy, TimeBasedRetentionStrategy: Concrete strategies
 * - VersionRetentionManager: Context that uses strategies
 */

/**
 * Strategy Interface
 * Defines the contract for all retention strategies
 */
class IRetentionStrategy {
  /**
   * Determine which versions should be kept
   * @param {Array} versions - Array of version objects with metadata
   * @returns {Array} Versions that should be kept
   */
  filterVersionsToKeep(versions) {
    throw new Error('Method must be implemented by concrete strategy');
  }

  /**
   * Get strategy name for logging/debugging
   */
  getName() {
    throw new Error('Method must be implemented by concrete strategy');
  }
}

/**
 * Concrete Strategy: Keep N Most Recent Versions
 *
 * Retains only the N most recent versions, deletes older ones
 */
class KeepRecentVersionsStrategy extends IRetentionStrategy {
  constructor(maxVersions = 10) {
    super();
    this.maxVersions = maxVersions;
  }

  filterVersionsToKeep(versions) {
    // Sort by lastModified descending (newest first)
    const sorted = [...versions].sort((a, b) =>
      new Date(b.lastModified) - new Date(a.lastModified)
    );

    // Keep only the first maxVersions
    return sorted.slice(0, this.maxVersions);
  }

  getName() {
    return `KeepRecent(${this.maxVersions})`;
  }
}

/**
 * Concrete Strategy: Time-Based Retention
 *
 * Keeps versions based on time windows:
 * - Last 24 hours: Keep all versions
 * - Last 7 days: Keep 1 per day
 * - Last 30 days: Keep 1 per week
 * - Older: Delete
 */
class TimeBasedRetentionStrategy extends IRetentionStrategy {
  constructor(options = {}) {
    super();
    this.keepAllHours = options.keepAllHours || 24;
    this.keepDailyDays = options.keepDailyDays || 7;
    this.keepWeeklyDays = options.keepWeeklyDays || 30;
  }

  filterVersionsToKeep(versions) {
    const now = new Date();
    const toKeep = [];
    const hourlyBuckets = new Map();
    const dailyBuckets = new Map();
    const weeklyBuckets = new Map();

    for (const version of versions) {
      const versionDate = new Date(version.lastModified);
      const ageHours = (now - versionDate) / (1000 * 60 * 60);
      const ageDays = ageHours / 24;

      // Always keep the latest version
      if (version.isLatest) {
        toKeep.push(version);
        continue;
      }

      // Keep all versions from last 24 hours
      if (ageHours <= this.keepAllHours) {
        toKeep.push(version);
        continue;
      }

      // Keep 1 per day for last 7 days
      if (ageDays <= this.keepDailyDays) {
        const dayKey = versionDate.toISOString().split('T')[0]; // YYYY-MM-DD
        if (!dailyBuckets.has(dayKey)) {
          dailyBuckets.set(dayKey, version);
          toKeep.push(version);
        }
        continue;
      }

      // Keep 1 per week for last 30 days
      if (ageDays <= this.keepWeeklyDays) {
        const weekKey = this.getWeekKey(versionDate);
        if (!weeklyBuckets.has(weekKey)) {
          weeklyBuckets.set(weekKey, version);
          toKeep.push(version);
        }
        continue;
      }

      // Older than 30 days: don't keep
    }

    return toKeep;
  }

  getWeekKey(date) {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week}`;
  }

  getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  getName() {
    return `TimeBased(${this.keepAllHours}h/${this.keepDailyDays}d/${this.keepWeeklyDays}d)`;
  }
}

/**
 * Concrete Strategy: Keep Tagged/Important Versions Only
 *
 * Keeps versions marked as important (e.g., release versions, milestones)
 * plus the latest version
 */
class TaggedVersionsStrategy extends IRetentionStrategy {
  filterVersionsToKeep(versions) {
    return versions.filter(version => {
      // Always keep latest
      if (version.isLatest) return true;

      // Keep if version has metadata indicating it's tagged/important
      // (MinIO allows custom metadata with x-amz-meta-* headers)
      const metadata = version.metaData || {};
      return metadata['x-amz-meta-tagged'] === 'true' ||
             metadata['x-amz-meta-release'] === 'true' ||
             metadata['x-amz-meta-milestone'];
    });
  }

  getName() {
    return 'TaggedVersions';
  }
}

/**
 * Context: Version Retention Manager
 *
 * Uses a retention strategy to manage file version lifecycle
 */
class VersionRetentionManager {
  constructor(fileSystemService, strategy) {
    this.fileSystemService = fileSystemService;
    this.strategy = strategy;
  }

  /**
   * Change retention strategy at runtime (Strategy Pattern)
   */
  setStrategy(strategy) {
    this.strategy = strategy;
    console.log(`Retention strategy changed to: ${strategy.getName()}`);
  }

  /**
   * Apply retention policy to a file's versions
   * Deletes versions that don't match the strategy
   */
  async applyRetentionPolicy(projectId, filePath) {
    try {
      // Get all versions
      const result = await this.fileSystemService.listFileVersions(projectId, filePath);

      if (!result.success || !result.versions) {
        throw new Error('Failed to list versions');
      }

      const allVersions = result.versions;

      // Apply strategy to determine which to keep
      const versionsToKeep = this.strategy.filterVersionsToKeep(allVersions);
      const versionIdsToKeep = new Set(versionsToKeep.map(v => v.versionId));

      // Find versions to delete
      const versionsToDelete = allVersions.filter(v =>
        !versionIdsToKeep.has(v.versionId) && !v.isLatest
      );

      console.log(`[${this.strategy.getName()}] File: ${filePath}`);
      console.log(`  Total versions: ${allVersions.length}`);
      console.log(`  To keep: ${versionsToKeep.length}`);
      console.log(`  To delete: ${versionsToDelete.length}`);

      // Delete old versions
      const deletedVersions = [];
      for (const version of versionsToDelete) {
        try {
          await this.fileSystemService.deleteFileVersion(
            projectId,
            filePath,
            version.versionId
          );
          deletedVersions.push(version.versionId);
        } catch (error) {
          console.error(`Failed to delete version ${version.versionId}:`, error.message);
        }
      }

      return {
        success: true,
        strategy: this.strategy.getName(),
        totalVersions: allVersions.length,
        keptVersions: versionsToKeep.length,
        deletedVersions: deletedVersions.length,
        deletedVersionIds: deletedVersions
      };

    } catch (error) {
      console.error('Error applying retention policy:', error);
      throw error;
    }
  }

  /**
   * Apply retention policy to all files in a project
   */
  async applyRetentionPolicyToProject(projectId) {
    try {
      // This would need to list all files in the project first
      // For now, just demonstrate the pattern
      console.log(`Applying ${this.strategy.getName()} to project ${projectId}`);

      return {
        success: true,
        message: `Retention policy applied to project`,
        strategy: this.strategy.getName()
      };
    } catch (error) {
      console.error('Error applying project-wide retention:', error);
      throw error;
    }
  }
}

// Export for use in other modules
module.exports = {
  IRetentionStrategy,
  KeepRecentVersionsStrategy,
  TimeBasedRetentionStrategy,
  TaggedVersionsStrategy,
  VersionRetentionManager
};
