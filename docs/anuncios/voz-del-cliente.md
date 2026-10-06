# Routine diaria: voz del cliente → brief y ángulos de anuncios

La corre la Routine "Voz del cliente → brief" todos los días a mediodía (Lima).
Sigue estos pasos al pie de la letra. Gasta pocos tokens: los scripts bajan y
recortan los chats, tú lees e interpretas. No inventes: todo lo que escribas
sale de un chat real.

## 1. Datos (últimas 24 h)

    ASESOR_CLAVE=$CLAVE python3 scripts/asesor/preparar.py api --dias 1 --salida /tmp/voz

Lee los archivos que deja en /tmp/voz (transcripciones por cliente). Lee
también `docs/anuncios/brief-avatar-oferta.md` completo y las últimas 40 filas
de la pestaña **Voz del cliente** de la hoja
19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY (para no repetir).

Si no hubo chats nuevos con algo más que el saludo, termina sin cambiar nada.

## 2. Qué buscar

Solo mensajes del CLIENTE (no de la vendedora ni automáticos):

- **Frases reales**: cómo describe su situación, sus ganas, sus dudas, con sus
  palabras exactas (sin nombres ni teléfonos).
- **Objeciones**: qué lo frena (precio, confianza, tiempo, "no sé nada",
  envío…) y si se destrabó, con qué respuesta.
- **Avatares**: quién compra o pregunta (edad o etapa si la dice, hombre/mujer,
  Lima/provincia, para sí o para regalo, experiencia previa). Marca solo
  patrones que aparezcan en 2 o más chats.
- **Ángulos de venta**: ideas de anuncio que salen de lo anterior (un deseo, un
  miedo, una pregunta frecuente, un uso que no habíamos visto). Cada ángulo
  con su nivel de consciencia y una frase de gancho estilo Gary Halbert.
- **Por qué compraron** los que cerraron (la última duda antes del sí).

## 3. Dónde lo escribes

a) Pestaña **Voz del cliente** de la hoja: una fila por hallazgo nuevo, debajo
   de la última:
   A Fecha · B Tipo (frase | objeción | avatar | ángulo | por qué compró) ·
   C Hallazgo (1–2 líneas) · D Cita textual del cliente · E Cuántos chats ·
   F Consciencia (solo ángulos) · G Gancho (solo ángulos) · H Usado en lote (vacío).
   Máximo 15 filas por día; prioriza lo nuevo y lo que más se repite.

b) **Brief** `docs/anuncios/brief-avatar-oferta.md`: si algo cambia lo que el
   brief dice (frase real nueva en "Frases reales de clientes", objeción nueva
   en "Objeciones", dato de avatar en "Demografía" o "Insights"), corrige esa
   sección y agrega arriba en "Bitácora de aprendizajes" una línea
   `AAAA-MM-DD · chats CRM (N) · aprendizaje`. Sigue las reglas de
   "Cómo mantener este documento" (datos propios > externos, no borrar, marcar
   obsoleto). Si nada cambia el brief, no lo toques.

c) Commit y push a `main` SOLO de `docs/anuncios/brief-avatar-oferta.md`
   (mensaje: "Brief: voz del cliente AAAA-MM-DD"). Nada más del repo.

## 4. Respuesta final

Solo: cuántos chats leíste, cuántas filas agregaste y, en 3 líneas, lo más
importante que aprendiste hoy.
