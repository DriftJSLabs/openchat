import type { Chat, Message } from './schema/shared';

export type OperationType = 'retain' | 'insert' | 'delete';

export interface Operation {
  type: OperationType;
  length?: number;
  content?: string;
  attributes?: Record<string, any>;
}

export interface TransformableOperation {
  id: string;
  operations: Operation[];
  baseVersion: number;
  userId: string;
  timestamp: number;
  entityId: string;
  entityType: 'chat' | 'message';
}

export interface OperationalTransformResult {
  transformedA: TransformableOperation;
  transformedB: TransformableOperation;
  conflict: boolean;
  conflictType?: 'concurrent_edit' | 'delete_edit' | 'format_conflict';
}

/**
 * Operational Transform implementation for collaborative text editing
 * Based on the operational transformation algorithm for handling concurrent edits
 */
export class OperationalTransform {
  
  /**
   * Transform two concurrent operations against each other
   */
  static transform(opA: TransformableOperation, opB: TransformableOperation): OperationalTransformResult {
    // Handle same operation (no transformation needed)
    if (opA.id === opB.id) {
      return {
        transformedA: opA,
        transformedB: opB,
        conflict: false
      };
    }

    // Handle delete operations specially
    if (this.isDeleteOperation(opA) || this.isDeleteOperation(opB)) {
      return this.transformDeleteOperations(opA, opB);
    }

    // Transform text operations
    const [transformedOpsA, transformedOpsB] = this.transformOperations(opA.operations, opB.operations);
    
    const transformedA: TransformableOperation = {
      ...opA,
      operations: transformedOpsA,
      baseVersion: Math.max(opA.baseVersion, opB.baseVersion) + 1
    };

    const transformedB: TransformableOperation = {
      ...opB,
      operations: transformedOpsB,
      baseVersion: Math.max(opA.baseVersion, opB.baseVersion) + 1
    };

    const conflict = this.detectConflict(opA, opB);

    return {
      transformedA,
      transformedB,
      conflict,
      conflictType: conflict ? this.getConflictType(opA, opB) : undefined
    };
  }

  /**
   * Transform a sequence of operations against another sequence
   */
  private static transformOperations(opsA: Operation[], opsB: Operation[]): [Operation[], Operation[]] {
    let indexA = 0;
    let indexB = 0;
    let positionA = 0;
    let positionB = 0;
    
    const transformedA: Operation[] = [];
    const transformedB: Operation[] = [];

    while (indexA < opsA.length || indexB < opsB.length) {
      const opA = opsA[indexA];
      const opB = opsB[indexB];

      if (!opA) {
        // Only B operations left
        transformedB.push(...opsB.slice(indexB));
        break;
      }

      if (!opB) {
        // Only A operations left
        transformedA.push(...opsA.slice(indexA));
        break;
      }

      // Transform individual operations
      const [newOpA, newOpB, advanceA, advanceB] = this.transformSingleOperations(
        opA, opB, positionA, positionB
      );

      if (newOpA) transformedA.push(newOpA);
      if (newOpB) transformedB.push(newOpB);

      if (advanceA) {
        indexA++;
        positionA += this.getOperationLength(opA);
      }
      if (advanceB) {
        indexB++;
        positionB += this.getOperationLength(opB);
      }
    }

    return [transformedA, transformedB];
  }

  /**
   * Transform two individual operations
   */
  private static transformSingleOperations(
    opA: Operation, 
    opB: Operation, 
    posA: number, 
    posB: number
  ): [Operation | null, Operation | null, boolean, boolean] {
    
    // Retain operations
    if (opA.type === 'retain' && opB.type === 'retain') {
      const minLength = Math.min(opA.length!, opB.length!);
      return [
        { type: 'retain', length: minLength },
        { type: 'retain', length: minLength },
        opA.length === minLength,
        opB.length === minLength
      ];
    }

    // Insert vs Insert
    if (opA.type === 'insert' && opB.type === 'insert') {
      // Tie-break by user ID or timestamp
      const aFirst = this.shouldInsertFirst(opA, opB, posA, posB);
      if (aFirst) {
        return [
          opA,
          { type: 'retain', length: opA.content!.length },
          true,
          false
        ];
      } else {
        return [
          { type: 'retain', length: opB.content!.length },
          opB,
          false,
          true
        ];
      }
    }

    // Insert vs Retain
    if (opA.type === 'insert' && opB.type === 'retain') {
      return [
        opA,
        { type: 'retain', length: opA.content!.length },
        true,
        false
      ];
    }

    if (opA.type === 'retain' && opB.type === 'insert') {
      return [
        { type: 'retain', length: opB.content!.length },
        opB,
        false,
        true
      ];
    }

    // Delete vs Insert
    if (opA.type === 'delete' && opB.type === 'insert') {
      return [
        null,
        opB,
        false,
        true
      ];
    }

    if (opA.type === 'insert' && opB.type === 'delete') {
      return [
        opA,
        null,
        true,
        false
      ];
    }

    // Delete vs Delete
    if (opA.type === 'delete' && opB.type === 'delete') {
      const minLength = Math.min(opA.length!, opB.length!);
      return [
        opA.length === minLength ? null : { type: 'delete', length: opA.length! - minLength },
        opB.length === minLength ? null : { type: 'delete', length: opB.length! - minLength },
        opA.length === minLength,
        opB.length === minLength
      ];
    }

    // Delete vs Retain
    if (opA.type === 'delete' && opB.type === 'retain') {
      const minLength = Math.min(opA.length!, opB.length!);
      return [
        { type: 'delete', length: minLength },
        null,
        opA.length === minLength,
        opB.length === minLength
      ];
    }

    if (opA.type === 'retain' && opB.type === 'delete') {
      const minLength = Math.min(opA.length!, opB.length!);
      return [
        null,
        { type: 'delete', length: minLength },
        opA.length === minLength,
        opB.length === minLength
      ];
    }

    // Default case
    return [opA, opB, true, true];
  }

  /**
   * Apply an operation to text content
   */
  static applyOperation(content: string, operations: Operation[]): string {
    let result = '';
    let position = 0;

    for (const op of operations) {
      switch (op.type) {
        case 'retain':
          result += content.slice(position, position + op.length!);
          position += op.length!;
          break;
        case 'insert':
          result += op.content!;
          break;
        case 'delete':
          position += op.length!;
          break;
      }
    }

    // Add any remaining content
    if (position < content.length) {
      result += content.slice(position);
    }

    return result;
  }

  /**
   * Generate operations to transform one text into another
   */
  static generateOperations(oldText: string, newText: string): Operation[] {
    // Simple diff algorithm - can be enhanced with more sophisticated algorithms
    const operations: Operation[] = [];
    
    // Find common prefix
    let commonStart = 0;
    while (commonStart < oldText.length && 
           commonStart < newText.length && 
           oldText[commonStart] === newText[commonStart]) {
      commonStart++;
    }

    // Find common suffix
    let commonEnd = 0;
    while (commonEnd < oldText.length - commonStart && 
           commonEnd < newText.length - commonStart && 
           oldText[oldText.length - 1 - commonEnd] === newText[newText.length - 1 - commonEnd]) {
      commonEnd++;
    }

    // Add retain for common prefix
    if (commonStart > 0) {
      operations.push({ type: 'retain', length: commonStart });
    }

    // Add delete for removed content
    const deletedLength = oldText.length - commonStart - commonEnd;
    if (deletedLength > 0) {
      operations.push({ type: 'delete', length: deletedLength });
    }

    // Add insert for new content
    const insertedContent = newText.slice(commonStart, newText.length - commonEnd);
    if (insertedContent.length > 0) {
      operations.push({ type: 'insert', content: insertedContent });
    }

    // Add retain for common suffix
    if (commonEnd > 0) {
      operations.push({ type: 'retain', length: commonEnd });
    }

    return operations;
  }

  /**
   * Compose two operation sequences
   */
  static compose(opsA: Operation[], opsB: Operation[]): Operation[] {
    const result: Operation[] = [];
    let indexA = 0;
    let indexB = 0;

    while (indexA < opsA.length || indexB < opsB.length) {
      const opA = opsA[indexA];
      const opB = opsB[indexB];

      if (!opA) {
        result.push(...opsB.slice(indexB));
        break;
      }

      if (!opB) {
        if (opA.type !== 'delete') {
          result.push(...opsA.slice(indexA));
        }
        break;
      }

      if (opA.type === 'delete') {
        result.push(opA);
        indexA++;
      } else if (opB.type === 'insert') {
        result.push(opB);
        indexB++;
      } else if (opA.type === 'retain' && opB.type === 'retain') {
        const length = Math.min(opA.length!, opB.length!);
        result.push({ type: 'retain', length });
        
        if (opA.length === length) indexA++;
        if (opB.length === length) indexB++;
      } else if (opA.type === 'insert' && opB.type === 'retain') {
        const length = Math.min(opA.content!.length, opB.length!);
        result.push({ type: 'insert', content: opA.content!.slice(0, length) });
        
        if (opA.content!.length === length) indexA++;
        if (opB.length === length) indexB++;
      } else if (opA.type === 'insert' && opB.type === 'delete') {
        const length = Math.min(opA.content!.length, opB.length!);
        
        if (opA.content!.length === length) indexA++;
        if (opB.length === length) indexB++;
      } else if (opA.type === 'retain' && opB.type === 'delete') {
        const length = Math.min(opA.length!, opB.length!);
        result.push({ type: 'delete', length });
        
        if (opA.length === length) indexA++;
        if (opB.length === length) indexB++;
      }
    }

    return result;
  }

  // Helper methods
  private static isDeleteOperation(op: TransformableOperation): boolean {
    return op.operations.some(o => o.type === 'delete' && !o.content);
  }

  private static transformDeleteOperations(
    opA: TransformableOperation, 
    opB: TransformableOperation
  ): OperationalTransformResult {
    const aIsDelete = this.isDeleteOperation(opA);
    const bIsDelete = this.isDeleteOperation(opB);

    if (aIsDelete && bIsDelete) {
      // Both are delete operations - no transformation needed, mark as conflict
      return {
        transformedA: opA,
        transformedB: opB,
        conflict: true,
        conflictType: 'delete_edit'
      };
    }

    if (aIsDelete) {
      // A deletes, B edits - A wins (delete operation takes precedence)
      return {
        transformedA: opA,
        transformedB: { ...opB, operations: [] },
        conflict: true,
        conflictType: 'delete_edit'
      };
    }

    if (bIsDelete) {
      // B deletes, A edits - B wins
      return {
        transformedA: { ...opA, operations: [] },
        transformedB: opB,
        conflict: true,
        conflictType: 'delete_edit'
      };
    }

    // Neither is delete (shouldn't reach here)
    return {
      transformedA: opA,
      transformedB: opB,
      conflict: false
    };
  }

  private static detectConflict(opA: TransformableOperation, opB: TransformableOperation): boolean {
    // Check if operations overlap in a conflicting way
    if (opA.entityId !== opB.entityId || opA.entityType !== opB.entityType) {
      return false;
    }

    // Check for concurrent edits in the same region
    return this.hasOverlappingChanges(opA.operations, opB.operations);
  }

  private static hasOverlappingChanges(opsA: Operation[], opsB: Operation[]): boolean {
    // Simplified conflict detection - can be enhanced
    const hasNonRetainA = opsA.some(op => op.type !== 'retain');
    const hasNonRetainB = opsB.some(op => op.type !== 'retain');
    return hasNonRetainA && hasNonRetainB;
  }

  private static getConflictType(
    opA: TransformableOperation, 
    opB: TransformableOperation
  ): 'concurrent_edit' | 'delete_edit' | 'format_conflict' {
    if (this.isDeleteOperation(opA) || this.isDeleteOperation(opB)) {
      return 'delete_edit';
    }
    
    // Check for formatting conflicts
    const hasFormattingA = opA.operations.some(op => op.attributes);
    const hasFormattingB = opB.operations.some(op => op.attributes);
    
    if (hasFormattingA || hasFormattingB) {
      return 'format_conflict';
    }

    return 'concurrent_edit';
  }

  private static shouldInsertFirst(
    opA: Operation, 
    opB: Operation, 
    posA: number, 
    posB: number
  ): boolean {
    // Tie-breaking rules for concurrent inserts
    if (posA !== posB) {
      return posA < posB;
    }
    
    // If at same position, use lexicographic order of content
    return (opA.content || '') < (opB.content || '');
  }

  private static getOperationLength(op: Operation): number {
    switch (op.type) {
      case 'retain':
      case 'delete':
        return op.length || 0;
      case 'insert':
        return op.content?.length || 0;
    }
  }
}

/**
 * High-level conflict resolution using operational transforms
 */
export class CollaborativeEditResolver {
  
  /**
   * Resolve conflicts between two versions of text using operational transforms
   */
  static resolveTextConflict(
    localText: string,
    cloudText: string,
    baseText: string,
    localOp: TransformableOperation,
    cloudOp: TransformableOperation
  ): {
    resolvedText: string;
    operations: Operation[];
    conflict: boolean;
    conflictResolution: 'merge' | 'local_wins' | 'cloud_wins';
  } {
    try {
      // Transform the operations
      const transformResult = OperationalTransform.transform(localOp, cloudOp);
      
      if (!transformResult.conflict) {
        // No conflict - apply both operations in sequence
        let result = baseText;
        result = OperationalTransform.applyOperation(result, transformResult.transformedA.operations);
        result = OperationalTransform.applyOperation(result, transformResult.transformedB.operations);
        
        const composedOps = OperationalTransform.compose(
          transformResult.transformedA.operations,
          transformResult.transformedB.operations
        );
        
        return {
          resolvedText: result,
          operations: composedOps,
          conflict: false,
          conflictResolution: 'merge'
        };
      }

      // Handle conflicts based on type
      switch (transformResult.conflictType) {
        case 'delete_edit':
          // Delete operations take precedence
          if (OperationalTransform['isDeleteOperation'](localOp)) {
            return {
              resolvedText: '',
              operations: [{ type: 'delete', length: baseText.length }],
              conflict: true,
              conflictResolution: 'local_wins'
            };
          } else {
            return {
              resolvedText: '',
              operations: [{ type: 'delete', length: baseText.length }],
              conflict: true,
              conflictResolution: 'cloud_wins'
            };
          }

        case 'concurrent_edit':
        case 'format_conflict':
        default:
          // For concurrent edits, prefer the more recent operation
          const localWins = localOp.timestamp > cloudOp.timestamp;
          
          if (localWins) {
            return {
              resolvedText: OperationalTransform.applyOperation(baseText, localOp.operations),
              operations: localOp.operations,
              conflict: true,
              conflictResolution: 'local_wins'
            };
          } else {
            return {
              resolvedText: OperationalTransform.applyOperation(baseText, cloudOp.operations),
              operations: cloudOp.operations,
              conflict: true,
              conflictResolution: 'cloud_wins'
            };
          }
      }
    } catch (error) {
      console.error('Error resolving text conflict:', error);
      
      // Fallback to timestamp-based resolution
      const localWins = localOp.timestamp > cloudOp.timestamp;
      return {
        resolvedText: localWins ? localText : cloudText,
        operations: localWins ? localOp.operations : cloudOp.operations,
        conflict: true,
        conflictResolution: localWins ? 'local_wins' : 'cloud_wins'
      };
    }
  }

  /**
   * Create operation from text changes
   */
  static createOperation(
    oldText: string,
    newText: string,
    entityId: string,
    entityType: 'chat' | 'message',
    userId: string,
    baseVersion: number
  ): TransformableOperation {
    const operations = OperationalTransform.generateOperations(oldText, newText);
    
    return {
      id: `${entityId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      operations,
      baseVersion,
      userId,
      timestamp: Date.now(),
      entityId,
      entityType
    };
  }
}