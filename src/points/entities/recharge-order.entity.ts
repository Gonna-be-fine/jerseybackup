import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type RechargeOrderStatus = 'pending' | 'paid' | 'closed' | 'failed';

@Entity('recharge_orders')
export class RechargeOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  orderNo: string;

  @Column()
  userId: number;

  @Column()
  packageId: string;

  @Column({ type: 'int' })
  amountCents: number;

  @Column({ type: 'int' })
  points: number;

  @Column({ default: 'pending' })
  status: RechargeOrderStatus;

  @Column({ default: 'alipay' })
  payChannel: string;

  @Column({ type: 'text', nullable: true })
  qrContent: string;

  @Column({ nullable: true })
  alipayTradeNo: string;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
