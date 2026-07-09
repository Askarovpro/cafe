// Frozen B2B contract — enums. Do not diverge from the design spec.

export enum Role {
  Manager = 'manager',
  Kitchen = 'kitchen',
  Driver = 'driver',
  Finance = 'finance', // moliyachi — reconciles cash from managers into the till
  Warehouse = 'warehouse', // skladchi — inventory + procurement
  Owner = 'owner',
}

// Cash custody chain for a delivered cash order (who physically holds the cash).
// undefined = still with the driver. After the finance confirms, the order is Closed.
export enum CashCustody {
  Manager = 'manager',
  Finance = 'finance',
}

export enum OrderStatus {
  New = 'new',
  Preparing = 'preparing',
  Ready = 'ready',
  Assigned = 'assigned',
  Delivering = 'delivering',
  Delivered = 'delivered',
  Closed = 'closed',
  Cancelled = 'cancelled',
}

export enum OrderAction {
  StartPrep = 'start_prep', // New -> Preparing (kitchen)
  Ready = 'ready', // Preparing -> Ready (kitchen); fires Poster writeback + ledger charge
  Assign = 'assign', // Ready -> Assigned (manager); own driver or Yandex deeplink
  Pickup = 'pickup', // Assigned -> Delivering (driver)
  Deliver = 'deliver', // Delivering -> Delivered (driver)
  // Cash custody chain (all Delivered self-transitions, cash orders only):
  CashToManager = 'cash_to_manager', // driver handed cash to manager -> custody Manager
  CashToFinance = 'cash_to_finance', // manager handed cash to finance -> custody Finance
  CashConfirm = 'cash_confirm', // finance confirmed receipt -> Closed + ledger payment
  Close = 'close', // Delivered -> Closed (manager); non-cash (prepaid/transfer)
  Cancel = 'cancel', // -> Cancelled; reverses side effects only if past Ready
}

export enum PaymentType {
  Cash = 'cash',
  Transfer = 'transfer',
  Prepaid = 'prepaid',
}

export enum DeliveryType {
  OwnDriver = 'own_driver',
  Yandex = 'yandex',
}

// Allowed state machine transitions. The backend MUST reject anything not listed here.
export const ORDER_TRANSITIONS: Record<OrderAction, { from: OrderStatus[]; to: OrderStatus; role: Role }> = {
  [OrderAction.StartPrep]: { from: [OrderStatus.New], to: OrderStatus.Preparing, role: Role.Kitchen },
  [OrderAction.Ready]: { from: [OrderStatus.Preparing], to: OrderStatus.Ready, role: Role.Kitchen },
  [OrderAction.Assign]: { from: [OrderStatus.Ready], to: OrderStatus.Assigned, role: Role.Manager },
  [OrderAction.Pickup]: { from: [OrderStatus.Assigned], to: OrderStatus.Delivering, role: Role.Driver },
  [OrderAction.Deliver]: { from: [OrderStatus.Delivering], to: OrderStatus.Delivered, role: Role.Driver },
  // Cash custody chain — self-transitions on Delivered; side effects set cashCustody.
  [OrderAction.CashToManager]: { from: [OrderStatus.Delivered], to: OrderStatus.Delivered, role: Role.Driver },
  [OrderAction.CashToFinance]: { from: [OrderStatus.Delivered], to: OrderStatus.Delivered, role: Role.Manager },
  // Finance confirms cash receipt -> Closed + ledger payment.
  [OrderAction.CashConfirm]: { from: [OrderStatus.Delivered], to: OrderStatus.Closed, role: Role.Finance },
  [OrderAction.Close]: { from: [OrderStatus.Delivered], to: OrderStatus.Closed, role: Role.Manager },
  // Cancel is special: allowed from any pre-Closed state; role checked separately (manager/owner).
  [OrderAction.Cancel]: {
    from: [OrderStatus.New, OrderStatus.Preparing, OrderStatus.Ready, OrderStatus.Assigned, OrderStatus.Delivering],
    to: OrderStatus.Cancelled,
    role: Role.Manager,
  },
};

// Side effects (Poster writeback + ledger charge) happen when an order first reaches this status.
export const SIDE_EFFECT_STATUS = OrderStatus.Ready;
