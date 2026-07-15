import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiTaskStatus = 'pending' | 'success' | 'failed';

@Entity('ai_tasks')
export class AiTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  taskType: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ default: 'pending' })
  status: AiTaskStatus;

  @Column({ type: 'int' })
  costPoints: number;

  @Column({ type: 'json', nullable: true })
  result: unknown;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
