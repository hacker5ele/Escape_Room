import { ITEMS, type ItemId } from '../story'

export function InventoryBar({ inventory }: { inventory: ReadonlySet<ItemId> }) {
  return (
    <div className="inventory-bar">
      <span className="inventory-label">INVENTORY</span>
      <div className="inventory-slots">
        {[...inventory].map((id) => {
          const item = ITEMS[id]
          return (
            <div key={id} className="inventory-item" title={item.name}>
              <span className="badge">{item.short}</span>
              <span className="inventory-item-name">{item.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
