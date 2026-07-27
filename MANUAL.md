# 🐐 Cayó la Cabra — Manual de la app de stock y ventas

- **App real**: https://joaquindangiolillo-oss.github.io/CLC/
- **Versión de prueba** (datos separados): https://joaquindangiolillo-oss.github.io/CLC/test/

## 🔒 Roles y el candadito

Se cambia de rol con el candadito arriba a la derecha: tocarlo, ingresar el PIN
(se puede marcar "recordar en este dispositivo"). Tocando de nuevo se bloquea.

- **👁 Lectura** (sin PIN): solo mira stock, ventas y pedidos.
- **🛒 Vendedor** (PIN 2244): para quien está en el puesto.
- **🔓 Admin** (PIN 1122): acceso total, incluye costos y balance.

| Qué puede hacer | 👁 | 🛒 | 🔓 |
|---|---|---|---|
| Ver stock, ventas y pedidos | ✓ | ✓ | ✓ |
| Registrar ventas (rápida y completa) | — | ✓ | ✓ |
| Editar / eliminar registros de venta | — | ✓ | ✓ |
| Crear y gestionar pedidos | — | ✓ | ✓ |
| Conteo de auditoría (guardar control) | — | ✓ | ✓ |
| Ajustar el stock real del sistema | — | — | ✓ |
| Finanzas: efectivo, transferencias, recaudado | — | ✓ | ✓ |
| Invertido, balance y ganancia por unidad | — | — | ✓ |
| Control de caja y su historial | — | — | ✓ |
| Registrar ingresos de mercadería (y ver costos) | — | — | ✓ |
| Cerrar temporada / temporadas anteriores | — | — | ✓ |

## 📦 Stock

Tablas de Remeras Adulto (diseño/color/talle), Tote Bags y Remeras Niñx.

- **Colores**: naranja = quedan ≤2 · rojo = 0 · **rojo fuerte = negativo**
  (se vendió algo que no figuraba; corregir con una auditoría).
- **"arm." / "sol."**: reservado en pedidos armados / solicitudes pendientes.
  El número grande es lo disponible para vender.
- **Recaudado**: tarjeta con lo cobrado en ARS y UYU; lleva a Ventas.
- **📄 PDF / 📤 WhatsApp**: exportan el inventario.
- **📥 Registrar ingreso** (admin): mercadería que llega, con costo unitario
  opcional (UYU por defecto) que alimenta el balance y la ganancia por unidad.
- **Historial de ingresos**: plegable; los costos solo los ve el admin.

## ⚡ Vender (+ Registrar)

**Venta rápida** (lo que abre el botón): categoría → diseño → talle → cantidad
y precio (editable, en UYU) → tocar **💵 EFECTIVO** o **📲 TRANSFER.** y queda
registrada. También 🎁 Regalo y 📉 Pérdida. Después aparece **↩️ Deshacer**.

**⚙️ Venta completa** (enlace al pie): Pegotines (monto total), venta en ARS,
📝 anotar deuda a nombre de alguien, y fecha manual para ventas de otro día.

**Vender sin stock**: si figura 0 (o menos que lo pedido) la app pregunta
"¿Deseás continuar?". Confirmando, la venta se registra igual y el stock queda
en negativo (rojo) hasta que el admin lo corrija.

## 💰 Ventas

- Tarjetas resumen: unidades, totales por moneda, efectivo, transferencias,
  regalos, pérdidas, anotados, pegotines.
- Filtros por método y por moneda; definen también qué sale en los reportes.
- Rango de fechas + 📄 PDF / 📤 WhatsApp para el reporte del período.
  La vista "Anotados" genera una tabla especial de deudores.
- **📝 Anotados**: deudas por ventas y por pedidos; con **💰 Registrar pago**
  se cobra total o parcial.
- Cada registro se puede ✏️ editar o 🗑️ eliminar (al eliminar vuelve el stock).
- El botón **Historial** muestra un resumen con gráfico de barras por día.

## 📋 Pedidos

1. **+ Nueva solicitud**: ítems, para quién, condiciones. Figura como "sol."
   pero no descuenta stock.
2. **Armar**: reserva la mercadería del stock disponible ("arm.").
3. **Entregar y cobrar**: Activos → Entregados → Completados. Lo entregado sin
   cobrar queda como deuda en Anotados. Cancelados devuelve la reserva.

## ✅ Auditoría (vendedor y admin)

- Ingresar solo los valores que difieren del sistema. **👁 Modo ciego** oculta
  los números del sistema mientras se cuenta.
- **Guardar auditoría** (vendedor): registra el control sin tocar el stock.
- **📌 Ajustar stock real** (admin): corrige el stock con lo contado, previa
  confirmación detallada.
- Historial de auditorías con foto del stock y motivo.

## 📈 Finanzas (vendedor y admin)

Por moneda (UYU y ARS):

- **Vendedor ve**: 💵 efectivo que debería haber en caja, 🏦 transferencias
  que deberían estar en la cuenta, 💰 recaudado total.
- **Solo admin**: 📥 invertido, 📈 balance, ganancia por unidad,
  **🧾 Control de caja** (contar lo entregado y comparar con el sistema, con
  historial) y **🎪 Cerrar temporada** (archiva todo y arranca de cero
  manteniendo el stock; queda en Temporadas anteriores con su resumen).

## ☁️ Sincronización

La nubecita conecta con una planilla de Google para compartir datos entre
celulares. Estados: ☁️ sin novedades · 🔄 sincronizando · ✅ al día · ❌ error.
Se configura una vez pegando la URL del script. Los datos se combinan, no se
pisan.

## 🧪 Versión de prueba

`/CLC/test/` (banner naranja) es idéntica pero con datos totalmente separados.
Dos cuidados: no pegar ahí la URL de sincronización real, y no usar "borrar
datos de navegación" para limpiarla (borraría también los datos de la app
real).
