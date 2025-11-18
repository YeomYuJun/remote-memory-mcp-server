export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
  createdAt: string;
}

export interface MemoryGraph {
  entities: Map<string, Entity>;
  relations: Relation[];
  metadata: {
    version: string;
    lastModified: string;
    lastSync: string;
  };
}

export class MemoryGraphManager {
  private graph: MemoryGraph;

  constructor() {
    this.graph = {
      entities: new Map(),
      relations: [],
      metadata: {
        version: '1.0.0',
        lastModified: new Date().toISOString(),
        lastSync: new Date().toISOString(),
      },
    };
  }

  createEntities(entities: Omit<Entity, 'createdAt' | 'updatedAt'>[]): void {
    const now = new Date().toISOString();
    
    entities.forEach(entity => {
      this.graph.entities.set(entity.name, {
        ...entity,
        createdAt: now,
        updatedAt: now,
      });
    });
    
    this.updateMetadata();
  }

  addObservations(observations: { entityName: string; contents: string[] }[]): void {
    const now = new Date().toISOString();
    
    observations.forEach(({ entityName, contents }) => {
      const entity = this.graph.entities.get(entityName);
      if (entity) {
        entity.observations.push(...contents);
        entity.updatedAt = now;
      }
    });
    
    this.updateMetadata();
  }

  createRelations(relations: Omit<Relation, 'createdAt'>[]): void {
    const now = new Date().toISOString();
    
    relations.forEach(relation => {
      this.graph.relations.push({
        ...relation,
        createdAt: now,
      });
    });
    
    this.updateMetadata();
  }

  deleteEntities(entityNames: string[]): void {
    entityNames.forEach(name => {
      this.graph.entities.delete(name);
      // 관련된 관계들도 삭제
      this.graph.relations = this.graph.relations.filter(
        rel => rel.from !== name && rel.to !== name
      );
    });
    
    this.updateMetadata();
  }

  deleteObservations(deletions: { entityName: string; observations: string[] }[]): void {
    const now = new Date().toISOString();
    
    deletions.forEach(({ entityName, observations }) => {
      const entity = this.graph.entities.get(entityName);
      if (entity) {
        entity.observations = entity.observations.filter(
          obs => !observations.includes(obs)
        );
        entity.updatedAt = now;
      }
    });
    
    this.updateMetadata();
  }

  deleteRelations(relations: Relation[]): void {
    relations.forEach(targetRel => {
      this.graph.relations = this.graph.relations.filter(
        rel => !(rel.from === targetRel.from && 
                rel.to === targetRel.to && 
                rel.relationType === targetRel.relationType)
      );
    });
    
    this.updateMetadata();
  }

  searchNodes(query: string): Entity[] {
    const searchTerm = query.toLowerCase();
    const results: Entity[] = [];
    
    this.graph.entities.forEach(entity => {
      const nameMatch = entity.name.toLowerCase().includes(searchTerm);
      const typeMatch = entity.entityType.toLowerCase().includes(searchTerm);
      const obsMatch = entity.observations.some(obs => 
        obs.toLowerCase().includes(searchTerm)
      );
      
      if (nameMatch || typeMatch || obsMatch) {
        results.push(entity);
      }
    });
    
    return results;
  }

  getNodes(names: string[]): Entity[] {
    return names
      .map(name => this.graph.entities.get(name))
      .filter((entity): entity is Entity => entity !== undefined);
  }

  // 새로운 쿼리 기능들
  listEntities(options?: {
    entityType?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'name';
    sortOrder?: 'asc' | 'desc';
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): { entities: Entity[]; total: number } {
    let entities = Array.from(this.graph.entities.values());

    // EntityType 필터링
    if (options?.entityType) {
      entities = entities.filter(e => e.entityType === options.entityType);
    }

    // 날짜 범위 필터링
    if (options?.dateFrom) {
      entities = entities.filter(e => e.createdAt >= options.dateFrom!);
    }
    if (options?.dateTo) {
      entities = entities.filter(e => e.createdAt <= options.dateTo!);
    }

    // 정렬
    const sortBy = options?.sortBy || 'createdAt';
    const sortOrder = options?.sortOrder || 'desc';
    entities.sort((a, b) => {
      let aVal: string, bVal: string;
      if (sortBy === 'name') {
        aVal = a.name;
        bVal = b.name;
      } else {
        aVal = a[sortBy];
        bVal = b[sortBy];
      }
      const comparison = aVal.localeCompare(bVal);
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const total = entities.length;

    // 페이지네이션
    if (options?.offset !== undefined || options?.limit !== undefined) {
      const offset = options.offset || 0;
      const limit = options.limit || 50;
      entities = entities.slice(offset, offset + limit);
    }

    return { entities, total };
  }

  getEntityNames(options?: {
    entityType?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'name';
    sortOrder?: 'asc' | 'desc';
  }): string[] {
    let entities = Array.from(this.graph.entities.values());

    if (options?.entityType) {
      entities = entities.filter(e => e.entityType === options.entityType);
    }

    const sortBy = options?.sortBy || 'createdAt';
    const sortOrder = options?.sortOrder || 'desc';
    entities.sort((a, b) => {
      let aVal: string, bVal: string;
      if (sortBy === 'name') {
        aVal = a.name;
        bVal = b.name;
      } else {
        aVal = a[sortBy];
        bVal = b[sortBy];
      }
      const comparison = aVal.localeCompare(bVal);
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return entities.map(e => e.name);
  }

  getEntityTypes(): { type: string; count: number }[] {
    const typeMap = new Map<string, number>();

    this.graph.entities.forEach(entity => {
      const count = typeMap.get(entity.entityType) || 0;
      typeMap.set(entity.entityType, count + 1);
    });

    return Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  getGraph(): MemoryGraph {
    return {
      entities: new Map(this.graph.entities),
      relations: [...this.graph.relations],
      metadata: { ...this.graph.metadata },
    };
  }

  loadGraph(graph: MemoryGraph): void {
    this.graph = {
      entities: new Map(graph.entities),
      relations: [...graph.relations],
      metadata: { ...graph.metadata },
    };
  }

  private updateMetadata(): void {
    this.graph.metadata.lastModified = new Date().toISOString();
  }

  toJSON(): any {
    return {
      entities: Object.fromEntries(this.graph.entities),
      relations: this.graph.relations,
      metadata: this.graph.metadata,
    };
  }

  fromJSON(data: any): void {
    this.graph = {
      entities: new Map(Object.entries(data.entities || {})),
      relations: data.relations || [],
      metadata: data.metadata || {
        version: '1.0.0',
        lastModified: new Date().toISOString(),
        lastSync: new Date().toISOString(),
      },
    };
  }
}