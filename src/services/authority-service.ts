/**
 * AuthorityService - Role-Based State Transition Authority
 *
 * 識学理論（Shikigaku Theory）準拠の状態遷移権限サービス
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  Role,
  MaturityLevel,
  UserRole,
  TransitionRequest,
  TransitionResult,
  TransitionHistory,
  RoleAssignmentRegistry,
} from '../types/authority';
import { getStateTransitionRule } from '../config/state-transition-authority';

/**
 * Authority Config
 */
export interface AuthorityConfig {
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * AuthorityService
 *
 * ロールベースの状態遷移権限管理
 */
export class AuthorityService {
  private config: AuthorityConfig;
  private registryPath: string;

  constructor(config: AuthorityConfig = {}) {
    this.config = config;
    this.registryPath = path.join(process.cwd(), 'role-assignments.yaml');
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${new Date().toISOString()}] [AuthorityService] ${message}`);
    }
  }

  /**
   * ユーザーにロールを割り当て
   *
   * @param userId - ユーザーID
   * @param roles - ロールリスト
   * @param assignedBy - 割り当て者
   * @param notes - 備考
   */
  async assignRole(
    userId: string,
    roles: Role[],
    assignedBy: string,
    notes?: string
  ): Promise<UserRole> {
    this.log(`Assigning roles to user: ${userId}`);

    const userRole: UserRole = {
      userId,
      roles,
      assignedAt: new Date().toISOString(),
      assignedBy,
      notes,
    };

    const registry = await this.loadRegistry();

    // 既存のUserRoleを削除
    registry.userRoles = registry.userRoles.filter((ur) => ur.userId !== userId);

    // 新しいUserRoleを追加
    registry.userRoles.push(userRole);
    registry.lastUpdated = new Date().toISOString();

    if (!this.config.dryRun) {
      await this.saveRegistry(registry);
    }

    this.log(`Roles assigned to ${userId}: ${roles.join(', ')}`);
    return userRole;
  }

  /**
   * ユーザーのロールを取得
   *
   * @param userId - ユーザーID
   * @returns Role[]
   */
  async getUserRoles(userId: string): Promise<Role[]> {
    this.log(`Getting roles for user: ${userId}`);

    const registry = await this.loadRegistry();
    const userRole = registry.userRoles.find((ur) => ur.userId === userId);

    if (!userRole) {
      this.log(`No roles found for user: ${userId}`);
      return [];
    }

    this.log(`User ${userId} has roles: ${userRole.roles.join(', ')}`);
    return userRole.roles;
  }

  /**
   * 状態遷移の権限をチェック
   *
   * @param from - 遷移元の状態
   * @param to - 遷移先の状態
   * @param userId - ユーザーID
   * @returns boolean
   */
  async canTransition(from: MaturityLevel, to: MaturityLevel, userId: string): Promise<boolean> {
    this.log(`Checking transition permission: ${from} -> ${to} for user: ${userId}`);

    // 遷移ルールを取得
    const rule = getStateTransitionRule(from, to);
    if (!rule) {
      this.log(`No transition rule found for: ${from} -> ${to}`);
      return false;
    }

    // ユーザーのロールを取得
    const userRoles = await this.getUserRoles(userId);
    if (userRoles.length === 0) {
      this.log(`User ${userId} has no roles assigned`);
      return false;
    }

    // ユーザーのロールが許可されたロールに含まれているかチェック
    const hasPermission = userRoles.some((role) => rule.allowedRoles.includes(role));

    if (hasPermission) {
      this.log(`User ${userId} has permission for transition: ${from} -> ${to}`);
    } else {
      this.log(`User ${userId} does NOT have permission for transition: ${from} -> ${to}`);
      this.log(`  User roles: ${userRoles.join(', ')}`);
      this.log(`  Required roles: ${rule.allowedRoles.join(', ')}`);
    }

    return hasPermission;
  }

  /**
   * 状態遷移を実行
   *
   * @param request - TransitionRequest
   * @returns TransitionResult
   */
  async executeTransition(request: TransitionRequest): Promise<TransitionResult> {
    this.log(
      `Executing transition: ${request.from} -> ${request.to} for resource: ${request.resourceId}`
    );

    // 権限チェック
    const allowed = await this.canTransition(request.from, request.to, request.requestedBy);

    if (!allowed) {
      return {
        success: false,
        allowed: false,
        error: `User ${request.requestedBy} does not have permission to transition from ${request.from} to ${request.to}`,
      };
    }

    // 遷移履歴を作成
    const history: TransitionHistory = {
      from: request.from,
      to: request.to,
      changedAt: new Date().toISOString(),
      changedBy: request.requestedBy,
      changedByRole: request.requestedByRole,
      reason: request.reason,
    };

    this.log(
      `Transition executed: ${request.from} -> ${request.to} by ${request.requestedBy} (${request.requestedByRole})`
    );

    return {
      success: true,
      allowed: true,
      history,
    };
  }

  /**
   * 全てのユーザーロールを取得
   */
  async getAllUserRoles(): Promise<UserRole[]> {
    const registry = await this.loadRegistry();
    return registry.userRoles;
  }

  /**
   * ユーザーロールの統計を取得
   */
  async getUserRoleStats(): Promise<{
    totalUsers: number;
    byRole: Record<Role, number>;
  }> {
    const registry = await this.loadRegistry();

    const stats = {
      totalUsers: registry.userRoles.length,
      byRole: {
        product_owner: 0,
        engineering_lead: 0,
        ssot_reviewer: 0,
        compliance_owner: 0,
        security_owner: 0,
        author: 0,
      } as Record<Role, number>,
    };

    for (const userRole of registry.userRoles) {
      for (const role of userRole.roles) {
        stats.byRole[role]++;
      }
    }

    return stats;
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  /**
   * Registry をロード
   */
  private async loadRegistry(): Promise<RoleAssignmentRegistry> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      return yaml.load(content) as RoleAssignmentRegistry;
    } catch {
      return {
        userRoles: [],
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  /**
   * Registry を保存
   */
  private async saveRegistry(registry: RoleAssignmentRegistry): Promise<void> {
    await fs.writeFile(
      this.registryPath,
      yaml.dump(registry, { indent: 2, lineWidth: -1, noRefs: true }),
      'utf-8'
    );
  }
}
