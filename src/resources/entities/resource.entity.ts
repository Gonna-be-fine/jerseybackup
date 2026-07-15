import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, Index } from 'typeorm';
import { ResourceCategory } from './resource-category.entity';

@Entity('resources')
@Index(['categoryId'])
@Index(['name'])
export class Resource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  categoryId: number;

  @Column()
  fileName: string;

  @Column()
  relativePath: string;

  @Column({ type: 'text', nullable: true })
  svgContent: string;

  @Column({ default: false })
  hasPng: boolean;

  @Column({ nullable: true })
  tags: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => ResourceCategory, category => category.resources)
  category: ResourceCategory;
}