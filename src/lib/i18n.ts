export type Language = 'eu' | 'en';

export const translations = {
    eu: {
        // Landing page
        landing: {
            tagline: 'Taldeak sortzen, denok bat egiteko.',
            adminAccess: 'Admin Sarbidea',
            start: 'Hasi',
            codeError: "This code doesn't exist",
        },

        // Form - Section titles
        form: {
            section1Title: 'Nor zara?',
            section2Title: 'Talde-dinamikak',
            section3Title: 'Gaitasun Profesionalak',
            section4Title: 'Gaitasun Pertsonalak',

            // Section 1
            selectName: 'Hautatu zure izena',
            selectPlaceholder: 'Aukeratu zerrendatik...',
            alreadyCompleted: '(Dagoeneko osatuta)',
            academicEmail: 'Email akademikoa',
            emailPlaceholder: 'izena.abizena',
            termsLink: 'Zehaztapenak eta baldintzak',
            termsAccept: 'onartzen ditut',
            termsDescription: 'Jarraian beteko ditudan datuak taldeak osatzeko erabiltzea onartzen dut.',

            // Disclaimer modal
            disclaimerTitle: 'Datuen Erabilera',
            disclaimerP1: 'Inkesta honetan jasotako datuak taldeak osatzeko erabiliko dira.',
            disclaimerP2: 'Zer gorde da?',
            disclaimerP2Content: 'Zure gaitasun autoebaluatuak, zure kideen hobespenak eta zure posta elektroniko akademikoa.',
            disclaimerP3: 'Proiektuaren irakasleak edo administratzaileak soilik ikus ditzake datu horiek. Ez dira erakundetik kanpoko hirugarrenekin partekatuko.',
            disclaimerClose: 'Ados',

            // Navigation
            nextSection: 'Hurrengo atala',
            back: 'Atzera',
            submit: 'Inkesta Bidali',

            // Validation messages
            confirmEmptyDynamics: 'Seguru zaude ezer aukeratu gabe jarraitu nahi duzula? Horrek zure talde-erabakiak baldintza ditzake.',
            confirmDefaultSkills: 'Seguru zaude gaitasunik aldatu gabe jarraitu nahi duzula? Batez besteko maila (5) onartuko da atal guztietan.',
        },

        // Section descriptions
        sectionDescriptions: {
            '1': `Kaixo! TaldeBOT zure lantalde ideala diseinatzen ahaleginduko da. Horretarako, zure profilaren fitxa osatu beharko duzu. Helburua ez da zu "sailkatzea", zure ikaskideen artean zein pieza osatzen duzun ulertzea baizik. Talde ahalik eta orekatuenak zein emankorrenak lortzeko, zintzotasun osoa eskatzen dizugu: hemen ez dago erantzun zuzen edo okerrik, galderak sentitzen duzunari leial izanda betetzea gomendatzen dizugu. Izan ere, zure gardentasuna funtsezkoa da ekarpen handiena eskaini ahalko diozun taldea topatzeko, beti ere, zure erosotasuna kontuan izanda. Eskerrik asko zure denboragatik!`,
            '2': `Atal honek zure lan-ingurune ideala diseinatzen laguntzen digu. Ikaskide berriekin elkarlana egitea sustatu nahi dugu, konfiantzazko kide bat alboan izango duzula ziurtatuta eta blokeorik gabeko giroa hobetziz. Zure lehentasunak eta segurtasun-zirkuluak adieraztean, TaldeBOT lan-harreman berriak erakitzen lagunduko dizu, taldeko giroa babestuta dagoela jakinda, proiektuan zure onena eman dezazun.`,
            '3': `Hemen zure lan-tresnak definitzen ditugu. Ez da denetik jakin behar, segurtasun handiena zein eremutan zentitzen duzun identifikatzea baizik, dela irudiaren errealizazioan, idazketan edo baliabideak lortzeko gaitasunean. TaldeBOTek informazio hori erabiliko du zure taldean pieza bat bera ere falta ez dadin, zuk dakizun horren horretan lideratu ahal izateko, besteen talentu profesionaletatik ikasten duzun bitartean.

Izan zintzoa zure egungo mailarekin.

1etik 4ra: Ikasten ari naiz eta laguntza behar dut arlo honetan.
5etik 7ra: Erraztsunez moldatzen naiz eta modu autonomoan lan egin dezaket.
8tik 10era: Jakintza handia dut eta beste batzuk lagundu ditzaket.`,
            '4': `Azkenik, kokatu zure gaitasun pertsonalak. Atal honek, taldeak dinamika orekatu eta egoki bat duela ziurtatzen lagunduko digu. Hemen, taldearen "motorra" ebaluatzen dugu. Zure jarrera zure konpetentzia profesionala bezain garrantzitsua da. 
Agintzea baino, entzutea nahiago duen pertsona bazara, edo gogoak jaisten direnean beti motibatzen duena bazara, islatu hemen. TaldeBOT zure nortasuna osatuko duten kideak bilatuko ditu, talkarik egon ez dadin, balantza orekatzeko lan-fluxu osasuntsu bat bultzatuz.`,
        },

        // Skill categories
        skillCategories: {
            narrative: 'Narratibak eraikitzeko gaitasunak',
            technical: 'Gaitasun teknikoak',
            management: 'Kudeaketa gaitasunak',
        },

        // Skills - Narrative
        skills: {
            narrative_creativity: { label: 'Sormena', description: 'Ideia originalak eta narratiba aberatsak sortzeko gaitasuna.' },
            narrative_writing: { label: 'Idazketa', description: 'Gidoiak, deskribapenak eta dokumentu ezberdinak idazteko gaitasuna.' },
            narrative_references: { label: 'Erreferentziak', description: 'Proiektuaren generoko edukien ezagutza eta erreferente ezberdinak identifikatzeko gaitasuna.' },
            narrative_communication: { label: 'Ahozko komunikazioa', description: 'Gende eta kamera aurrean hitz egiteko gaitasuna.' },
            technical_camera: { label: 'Irudiaren errealizazioa eta grabaketa', description: 'Narratiba bisual aberats bat eraikitzeko baliabiden ezagutza eta erabilera gaitasuna' },
            technical_sound: { label: 'Soinua', description: 'Kalitatezko audioa grabatzeko baliabideen ezagutza eta erabilera gaitasuna.' },
            technical_editing: { label: 'Edizioa', description: 'Edizio software ezberdinak erabilita, grabatutako materiala manipulatzeko, erritmoa emateko eta efektu bisualen bidez azken emaitza fintzeko gaitasuna.' },
            management_planning: { label: 'Plangintza eta antolaketa', description: 'Lan-egutegiak diseinatzeko, epeak kudeatzeko eta taldearen zereginak modu egokian egituratzeko gaitasuna.' },
            management_production: { label: 'Ekoizpena', description: 'Proiektua aurrera eramateko beharrezkoak diren baliabideak (materialak, pertsonalak, baimenak, logistika…) kudeatzeko eta lortzeko gaitasuna.' },
            soft_leadership: { label: 'Lidergoa', description: 'Taldea gidatzeko, erabakiak hartzeko eta kideak helburu komun baterantz bideratzeko gaitasuna.' },
            soft_listening: { label: 'Entzume-aktiboa', description: 'Besteen ideiak arretaz jasotzeko, ulertzeko eta onartzeko gaitasuna, komunikazio on bat bermatzeko.' },
            soft_proactivity: { label: 'Proaktibitatea', description: 'Ekimena hartzeko eta gauzak gertatu arte itxaron gabe lanean hasteko gaitasuna.' },
            soft_teamwork: { label: 'Talde-lana', description: 'Besteekin lankidetzan aritzeko, baliabideak partekatzeko eta helburuak lortzeko guztion arteko sinergia bilatzeko gaitasuna.' },
            soft_conflict: { label: 'Gatazken konponbidea', description: 'Desberdintasunen eta arazoen aurrean lasaitasuna mantentzeko eta talde-giro ona babestuko duten akordioak lortzeko gaitasuna.' },
            soft_motivation: { label: 'Proiektuarekiko motibazioa', description: 'Proiektu hau burutzeko ditudan gogoak eta ilusioari eusteko gaitasuna' },
        },

        // Group dynamics
        groupDynamics: {
            comfort: { label: 'Pertsona Aingura', placeholder: 'Norekin lan egiten duzu ondoen?' },
            preferWith: { label: 'Elkarlan Berriak', placeholder: 'Norekin ez duzu oraindik lanik egin eta gustatuko litzaizuke proiektu honetan lan egitea??' },
            preferAvoid: { label: 'Mugak', placeholder: 'Zein kide nahiago zenuke proiektu honetan saihestea?' },
        },

        // Confirmation page
        confirmation: {
            title: 'Datuak bidali dira!',
            message: 'Eskerrik asko zure erantzunagatik. Zure informazioa taldeak osatzeko erabiliko dugu. Posta elektroniko bat jasoko duzu taldeak behin betiko eratzen direnean.',
            canClose: 'Leiho hau itxi dezakezu.',
            backHome: 'Hasierara bueltatu',
        },
    },

    en: {
        // Landing page
        landing: {
            tagline: 'Creating teams, uniting everyone.',
            adminAccess: 'Admin Access',
            start: 'Start',
            codeError: "This code doesn't exist",
        },

        // Form - Section titles
        form: {
            section1Title: 'Who are you?',
            section2Title: 'Group Dynamics',
            section3Title: 'Professional Skills',
            section4Title: 'Personal Skills',

            // Section 1
            selectName: 'Select your name',
            selectPlaceholder: 'Choose from the list...',
            alreadyCompleted: '(Already completed)',
            academicEmail: 'Academic email',
            emailPlaceholder: 'firstname.lastname',
            termsLink: 'Terms and conditions',
            termsAccept: 'I accept',
            termsDescription: 'I agree that the data I provide will be used to form teams.',

            // Disclaimer modal
            disclaimerTitle: 'Data Usage',
            disclaimerP1: 'The data collected in this survey will be used to form teams.',
            disclaimerP2: 'What is stored?',
            disclaimerP2Content: 'Your self-evaluated skills, your teammate preferences, and your academic email.',
            disclaimerP3: 'Only project instructors or administrators can view this data. It will not be shared with third parties outside the institution.',
            disclaimerClose: 'OK',

            // Navigation
            nextSection: 'Next section',
            back: 'Back',
            submit: 'Submit Survey',

            // Validation messages
            confirmEmptyDynamics: 'Are you sure you want to continue without selecting anyone? This may affect your team assignment.',
            confirmDefaultSkills: 'Are you sure you want to continue without changing any skills? The average level (5) will be accepted for all sections.',
        },

        // Section descriptions
        sectionDescriptions: {
            '1': `Hello! TaldeBOT will try to design your ideal work team. To do this, you need to complete your profile. The goal is not to "classify" you, but to understand what piece you represent among your classmates. To achieve the most balanced and productive teams, we ask for complete honesty: there are no right or wrong answers here, we recommend filling in the questions staying true to how you feel. Your transparency is essential to find the team where you can make the greatest contribution, always considering your comfort. Thank you for your time!`,
            '2': `This section helps us design your ideal work environment. We want to encourage collaboration with new classmates, while ensuring you have a trusted teammate by your side and improving the atmosphere without blockages. By expressing your preferences and safety circles, TaldeBOT will help you build new working relationships, knowing that the team atmosphere is protected, so you can give your best in the project.`,
            '3': `Here we define your work tools. You don't need to know everything, but rather identify where you feel most confident, whether in image production, writing, or resource acquisition. TaldeBOT will use this information so that your team doesn't lack any piece, allowing you to lead in what you know while learning from others' professional talents.

Be honest about your current level.

1 to 4: I'm learning and need help in this area.
5 to 7: I manage easily and can work autonomously.
8 to 10: I have extensive knowledge and can help others.`,
            '4': `Finally, rate your personal skills. This section helps us ensure teams have a balanced and appropriate dynamic. Here, we evaluate the team's "engine". Your attitude is as important as your professional competence. 
If you're someone who prefers listening over commanding, or you're always the one motivating when spirits are low, reflect that here. TaldeBOT will look for teammates who complement your personality, avoiding conflicts and promoting a healthy work flow.`,
        },

        // Skill categories
        skillCategories: {
            narrative: 'Narrative building skills',
            technical: 'Technical skills',
            management: 'Management skills',
        },

        // Skills
        skills: {
            narrative_creativity: { label: 'Creativity', description: 'Ability to generate original ideas and rich narratives.' },
            narrative_writing: { label: 'Writing', description: 'Ability to write scripts, descriptions, and various documents.' },
            narrative_references: { label: 'References', description: 'Knowledge of project genre content and ability to identify different references.' },
            narrative_communication: { label: 'Oral communication', description: 'Ability to speak in front of people and cameras.' },
            technical_camera: { label: 'Image production and recording', description: 'Knowledge and ability to use resources to build a rich visual narrative.' },
            technical_sound: { label: 'Sound', description: 'Knowledge and ability to use resources for quality audio recording.' },
            technical_editing: { label: 'Editing', description: 'Ability to manipulate recorded material using various editing software, create rhythm, and refine the final result with visual effects.' },
            management_planning: { label: 'Planning and organization', description: 'Ability to design work schedules, manage deadlines, and properly structure team tasks.' },
            management_production: { label: 'Production', description: 'Ability to manage and obtain resources needed for the project (materials, personnel, permits, logistics...).' },
            soft_leadership: { label: 'Leadership', description: 'Ability to guide the team, make decisions, and direct members toward a common goal.' },
            soft_listening: { label: 'Active listening', description: 'Ability to carefully receive, understand, and accept others\' ideas to ensure good communication.' },
            soft_proactivity: { label: 'Proactivity', description: 'Ability to take initiative and start working without waiting for things to happen.' },
            soft_teamwork: { label: 'Teamwork', description: 'Ability to collaborate with others, share resources, and seek synergy among everyone to achieve goals.' },
            soft_conflict: { label: 'Conflict resolution', description: 'Ability to stay calm in the face of differences and problems and reach agreements that protect the team atmosphere.' },
            soft_motivation: { label: 'Project motivation', description: 'My enthusiasm and ability to maintain excitement for completing this project.' },
        },

        // Group dynamics
        groupDynamics: {
            comfort: { label: 'Anchor Person', placeholder: 'Who do you work best with?' },
            preferWith: { label: 'New Collaborations', placeholder: 'Who haven\'t you worked with yet and would like to work with on this project?' },
            preferAvoid: { label: 'Boundaries', placeholder: 'Which teammate would you prefer to avoid in this project?' },
        },

        // Confirmation page
        confirmation: {
            title: 'Data submitted!',
            message: 'Thank you for your response. Your information will be used to form teams. You will receive an email when the teams are finalized.',
            canClose: 'You can close this window.',
            backHome: 'Back to home',
        },
    },
} as const;

export function t(lang: Language) {
    return translations[lang];
}

export function getLanguageFromPath(path: string): Language {
    return path.startsWith('/en') ? 'en' : 'eu';
}
