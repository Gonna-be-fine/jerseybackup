import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PointTransactionType =
  | 'recharge'
  | 'ai_consume'
  | 'refund'
  | 'admin_adjust';

@Entity('point_transactions')
export class PointTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  type: PointTransactionType;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'int' })
  balanceAfter: number;

  @Column({ nullable: true })
  bizType: string;

  @Column({ nullable: true })
  bizId: string;

  @Column({ nullable: true })
  remark: string;

  @CreateDateColumn()
  createdAt: Date;
}
