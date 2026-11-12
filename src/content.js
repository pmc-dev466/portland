// Portfolio copy. Each section is anchored to a place on the island.
// `anchor` is in scene pixels (2048x2048 source illustration).

export const PROFILE = {
  name: 'Pedro Jesús Muñoz Cifuentes',
  role: 'Software Engineer',
  tagline: 'Backend · Java · Spring Boot',
  email: 'pejemuci@hotmail.com',
  site: 'pjmc.dev',
  cv: 'resources/CV_PedroJesusMuñozCifuentes_es.pdf',
};

export const SECTIONS = [
  {
    id: 'sobre-mi',
    place: 'La casa',
    title: 'Sobre mí',
    anchor: [1068, 838],
    label: 'left',
    zoom: 1.7,
    lede: 'Ingeniero de software. Construyo el backend que no se ve, para que todo lo demás funcione.',
    body: [
      { type: 'p', text: 'Llevo 4 años desarrollando backend con Java y Spring Boot, diseñando e implementando arquitecturas de microservicios.' },
      { type: 'p', text: 'Hoy ejerzo como Analista de Software: eso me ha dado una visión técnica desde los requisitos, la viabilidad y la calidad arquitectónica, además de liderazgo técnico y mentoría dentro del equipo.' },
      { type: 'p', text: 'Me mueve el código limpio, la mejora continua y entregar soluciones escalables y mantenibles.' },
      {
        type: 'facts',
        items: [
          ['4 años', 'de experiencia backend'],
          ['Java 8 → 21', 'modernizando legacy'],
          ['Cádiz', 'abierto a cambiar de ubicación'],
        ],
      },
    ],
  },
  {
    id: 'experiencia',
    place: 'El molino',
    title: 'Experiencia',
    anchor: [1238, 700],
    label: 'right',
    zoom: 1.45,
    lede: 'Lo que hace girar las aspas: equipos, sistemas reales y entregas.',
    body: [
      {
        type: 'timeline',
        items: [
          {
            role: 'Analista de Software',
            where: 'iConsulting365 · Sevilla',
            when: '06/2025 — Actual',
            points: [
              'Análisis de órdenes de trabajo y solicitudes de cambio: viabilidad técnica, impacto y esfuerzo.',
              'Requisitos funcionales y no funcionales, especificaciones técnicas y casos de uso con trazabilidad negocio → solución.',
              'Estimaciones realistas mediante descomposición por tareas y priorización por impacto.',
              'Code reviews alineadas con arquitectura hexagonal y diseño de APIs REST.',
              'Liderazgo técnico: reparto de tareas, desbloqueo y mentoría del equipo.',
              'Interlocución directa con stakeholders y ceremonias Scrum.',
            ],
          },
          {
            role: 'Desarrollador de Software',
            where: 'iConsulting365 · Sevilla',
            when: '10/2022 — 06/2025',
            points: [
              'Backend en Java 21 con Spring Boot: APIs REST para frontends Angular en microservicios de la Junta de Andalucía.',
              'Modernización de proyectos legacy de Java 8 a Java 21.',
              'Servicios con comunicación síncrona (REST) y asíncrona, desacoplados e independientes.',
              'Persistencia con Oracle SQL (JPA/Hibernate) y MongoDB.',
              'Seguridad y autenticación con Spring Security.',
              'Docker y CI/CD sobre Azure Pipelines; tests con JUnit y Mockito, calidad con SonarQube.',
            ],
          },
          {
            role: 'Profesional de Hostelería',
            where: 'Restaurante La Fontanilla · Conil de la Frontera',
            when: '01/2019 — 08/2022',
            points: ['Atención al cliente y organización del servicio en un entorno de alta demanda.'],
          },
        ],
      },
    ],
  },
  {
    id: 'stack',
    place: 'La cascada',
    title: 'Stack técnico',
    anchor: [690, 1385],
    label: 'left',
    zoom: 1.6,
    lede: 'Las herramientas por las que fluye el trabajo.',
    body: [
      {
        type: 'groups',
        items: [
          ['Lenguajes', ['Java 8–21', 'JavaScript', 'SQL']],
          ['Frameworks', ['Spring Boot', 'Spring MVC', 'Spring Security', 'Spring Data', 'Angular']],
          ['Arquitectura', ['Microservicios', 'Hexagonal', 'APIs REST', 'BFF']],
          ['Bases de datos', ['Oracle SQL', 'MongoDB', 'JPA / Hibernate']],
          ['DevOps & CI/CD', ['Docker', 'Azure Pipelines', 'Git']],
          ['Testing & calidad', ['JUnit', 'Mockito', 'SonarQube']],
          ['Herramientas', ['Jira', 'Azure Boards', 'Confluence', 'Postman', 'IntelliJ', 'VS Code']],
          ['Metodologías', ['Scrum', 'Kanban', 'Agile']],
        ],
      },
    ],
  },
  {
    id: 'formacion',
    place: 'El árbol',
    title: 'Formación',
    anchor: [1455, 800],
    label: 'right',
    zoom: 1.6,
    lede: 'Las raíces.',
    body: [
      {
        type: 'timeline',
        items: [
          {
            role: 'Grado en Ingeniería Informática',
            where: 'Universidad de Sevilla · Mención Ingeniería del Software',
            when: '2016 — 2022',
            points: [],
          },
        ],
      },
      { type: 'h', text: 'Idiomas' },
      {
        type: 'facts',
        items: [
          ['Español', 'nativo'],
          ['Inglés', 'B2'],
        ],
      },
    ],
  },
  {
    id: 'contacto',
    place: 'El puente',
    title: 'Contacto',
    anchor: [652, 1168],
    label: 'left',
    zoom: 1.6,
    lede: 'Crucemos el puente: cuéntame en qué estás trabajando.',
    body: [{ type: 'contact' }],
  },
];
