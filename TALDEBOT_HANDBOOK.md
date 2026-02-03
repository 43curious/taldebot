# 🤖 Guía de TaldeBot: Cómo funciona

¡Bienvenido a TaldeBot! Esta guía explica cómo este programa convierte una lista de estudiantes en equipos perfectamente equilibrados. Lo hemos diseñado para que sea lo más "inteligente" posible, teniendo en cuenta no solo las habilidades, sino también cómo prefieren trabajar las personas entre sí.

---

## 🗺️ Mapa de Navegación: ¿Dónde está cada cosa?

Si te pierdes navegando por la web o el código, aquí tienes el mapa de carreteras:

### 1. El Panel del Profesor (Administrador)
Aquí es donde ocurre la gestión principal.
*   **Inicio de Sesión**: `tu-web.com/admin/login`
    *   📍 Archivo: [`src/pages/admin/login.astro`](file:///Users/jon/Development/TaldeBot-v2/src/pages/admin/login.astro)
*   **Listado de Proyectos (Dashboard)**: `tu-web.com/admin/dashboard`
    *   Es la pantalla principal que ves tras entrar. Aquí ves todos tus proyectos.
    *   🏷️ **ID del Proyecto**: Aparece en la esquina superior derecha de cada tarjeta de proyecto (ej: "ID: 1").
    *   📍 Archivo: [`src/pages/admin/dashboard.astro`](file:///Users/jon/Development/TaldeBot-v2/src/pages/admin/dashboard.astro)
*   **Crear un Proyecto**: `tu-web.com/admin/create-project`
    *   📍 Archivo: [`src/pages/admin/create-project.astro`](file:///Users/jon/Development/TaldeBot-v2/src/pages/admin/create-project.astro)
    *   **¿Qué haces aquí?** Pones el nombre de la clase, eliges cuántos equipos quieres y pegas la lista de nombres de los alumnos. El sistema te asignará un ID automáticamente al terminar.

### 2. La Encuesta de los Alumnos
*   **Acceso**: Los alumnos entran en la página principal (`tu-web.com/`) e introducen el **ID del Proyecto** que tú les des.
*   **Formulario de la Encuesta**: `tu-web.com/student/form/1` (el '1' es el ID del proyecto).
    *   📍 Archivo: [`src/pages/student/form/[projectId].astro`](file:///Users/jon/Development/TaldeBot-v2/src/pages/student/form/[projectId].astro)
    *   **¿Qué hacen ellos?** Eligen su nombre de la lista, marcan con quién quieren ir (y con quién no) y puntúan sus habilidades.

### 3. Seguimiento y Resultados
*   **Monitorización**: `tu-web.com/admin/monitor/1`
    *   📍 Archivo: [`src/pages/admin/monitor/[projectId].astro`](file:///Users/jon/Development/TaldeBot-v2/src/pages/admin/monitor/[projectId].astro)
    *   Aquí ves quién ha rellenado ya la encuesta y quién falta.
*   **Ver Equipos Creados**: `tu-web.com/admin/teams/1`
    *   📍 Archivo: [`src/pages/admin/teams/[projectId].astro`](file:///Users/jon/Development/TaldeBot-v2/src/pages/admin/teams/[projectId].astro)
    *   Aquí aparecen los equipos finales. Puedes exportarlos a Excel/CSV o imprimir la lista.

---

## 🏗️ Flujo de Trabajo: Paso a Paso

1.  **Crea el Proyecto**: Ve a "Create New Project" en el Dashboard. Al terminar, la web te dará un número (ID de Proyecto).
2.  **Reparte el ID**: Diles a tus alumnos: "Buscad TaldeBot y entrad con el ID 1".
3.  **Espera resultados**: Mira la pantalla de "Monitor" hasta que veas que todos los alumnos han terminado.
4.  **Genera Equipos**: Pulsa el botón "Generate Teams" en la pantalla de monitorización.
5.  **Revisa y Exporta**: Mira los equipos en la pantalla final. Si algo no te gusta, ¡puedes dar a "Regenerate" para que el Cerebro pruebe otra combinación!

---

## 🧠 El "Cerebro": Cómo se crean los equipos

Este es el archivo que hace la magia matemática: [`src/lib/teamMatcher.ts`](file:///Users/jon/Development/TaldeBot-v2/src/lib/teamMatcher.ts).

Utiliza un **Sistema de Puntuación**:
1.  **Reglas de Oro**: Si dos alumnos no se llevan bien (lista de "Evitar"), el Cerebro los separa.
2.  **Amistades**: Si han pedido ir juntos, intenta juntarlos si las habilidades cuadran.
3.  **Equilibrio**: El Cerebro mira las habilidades técnicas (Cámara, Edición) y reparte a los "expertos" para que ningún equipo sea demasiado flojo ni demasiado fuerte.
4.  **Liderazgo**: Intenta que no haya guerras de poder (muchos líderes en un equipo) ni barcos a la deriva (ningún líder).

---

## 🛠️ Archivos Clave del Desarrollador
*   [`db/schema.ts`](file:///Users/jon/Development/TaldeBot-v2/db/schema.ts): Define cómo se guardan los datos en la "maleta" (Base de Datos).
*   [`src/pages/api/admin/generate-teams.ts`](file:///Users/jon/Development/TaldeBot-v2/src/pages/api/admin/generate-teams.ts): Es el puente entre el botón y el Cerebro.

---

## ❓ ¿Qué pasa si alguien no viene?

Si un alumno falta a clase o no puede participar, tienes dos opciones desde la pantalla de **Monitor**:

1.  **Marcar como Ausente (Excluir)**: 
    *   Haz clic en "Options" junto al nombre del alumno y elige **"Mark as Absent"**.
    *   **¿Qué hace el Cerebro?** El sistema apartará a este alumno y lo pondrá en una lista especial. Al generar los equipos, intentará repartir a los ausentes de forma que **nunca haya más de uno por equipo** (si es posible), para que ningún grupo se quede cojo con dos personas que no han venido.
2.  **Rellenar por el Alumno**:
    *   Si conoces bien al alumno y quieres decidir tú su perfil, haz clic en **"Fill for Student"**.
    *   Esto te llevará a la encuesta del alumno con su nombre ya seleccionado para que puedas completarla tú mismo en su lugar.

---

### Resumen para Principiantes
TaldeBot es como un **organizador de fiestas inteligente**. Tú le das la lista de invitados, ellos le dicen qué música les gusta y con quién no quieren hablar, y TaldeBot organiza las mesas para que todo el mundo se lo pase lo mejor posible. ¡Incluso sabe qué hacer si alguien avisa de que no puede venir! 🚀
