-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: mysql:3306
-- Tiempo de generación: 15-12-2025 a las 23:41:26
-- Versión del servidor: 5.7.44
-- Versión de PHP: 8.2.27

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `CardioFit`
--

DELIMITER $$
--
-- Procedimientos
--
CREATE DEFINER=`cardiofit_user`@`%` PROCEDURE `AgendarAutomatico` (IN `p_user_id` INT, IN `p_date` DATE, IN `p_time` TIME)   BEGIN
    -- Declaración de variables
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_staff_id INT;
    DECLARE v_capacity INT;
    DECLARE v_current_bookings INT;
    DECLARE v_day_of_week INT;
    DECLARE v_assigned_staff VARCHAR(100);
    DECLARE v_is_open INT DEFAULT 0; -- Nueva variable para saber si está abierto

    -- 1. CALCULAR DÍA DE LA SEMANA
    -- MySQL devuelve: 0=Lunes ... 6=Domingo. Sumamos 1 para que sea: 1=Lunes ... 7=Domingo
    SET v_day_of_week = WEEKDAY(p_date) + 1; 

    -- ==============================================================================
    -- NUEVO: VALIDACIONES DE HORARIO (EL PORTERO)
    -- ==============================================================================

    -- CASO A: Es Domingo (Día 7)
    IF v_day_of_week = 7 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Lo sentimos, no laboramos los Domingos. Por favor elige otro día.';
    END IF;

    -- CASO B: ¿Está abierto el gimnasio a esa hora?
    -- Contamos cuántos entrenadores activos tienen turno a esa hora exacta
    SELECT COUNT(*) INTO v_is_open
    FROM WeeklySchedules ws
    JOIN Staff s ON ws.staff_id = s.id
    WHERE ws.day_of_week = v_day_of_week
      AND CAST(p_time AS TIME) >= CAST(ws.start_time AS TIME) 
      AND CAST(p_time AS TIME) < CAST(ws.end_time AS TIME)
      AND s.is_active = 1;

    -- Si nadie está trabajando (v_is_open es 0), mandamos error de "Cerrado"
    IF v_is_open = 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'El centro está cerrado en este horario. Por favor verifica nuestra disponibilidad.';
    END IF;

    -- ==============================================================================
    -- LÓGICA DE AGENDAMIENTO (Solo llegamos aquí si está abierto y es día laboral)
    -- ==============================================================================

    BEGIN
        -- Declaramos el CURSOR dentro de un bloque anidado para evitar errores de sintaxis
        DECLARE cur CURSOR FOR 
            SELECT s.id, ws.max_capacity, s.name
            FROM Staff s
            JOIN WeeklySchedules ws ON s.id = ws.staff_id
            WHERE ws.day_of_week = v_day_of_week
              AND CAST(p_time AS TIME) >= CAST(ws.start_time AS TIME) 
              AND CAST(p_time AS TIME) < CAST(ws.end_time AS TIME)
              AND s.is_active = 1
            ORDER BY s.priority_order ASC;
            
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

        OPEN cur;

        read_loop: LOOP
            FETCH cur INTO v_staff_id, v_capacity, v_assigned_staff;
            IF done THEN
                LEAVE read_loop;
            END IF;

            -- Contar ocupación actual
            SELECT COUNT(*) INTO v_current_bookings
            FROM Appointments
            WHERE staff_id = v_staff_id 
              AND appointment_date = p_date 
              AND start_time = p_time
              AND status = 'confirmed';

            -- Si hay espacio, agendamos
            IF v_current_bookings < v_capacity THEN
                INSERT INTO Appointments (user_id, staff_id, appointment_date, start_time, end_time)
                VALUES (p_user_id, v_staff_id, p_date, p_time, ADDTIME(p_time, '01:00:00'));
                
                SELECT CONCAT('Reserva confirmada con ', v_assigned_staff) as Mensaje;
                SET done = TRUE; 
                LEAVE read_loop;
            END IF;
        END LOOP;

        CLOSE cur;
    END;
    
    -- Si llegamos al final y no se agendó nada (y no fue por estar cerrado), es que está LLENO
    IF (SELECT ROW_COUNT() = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lo sentimos, todos nuestros entrenadores están ocupados a esa hora.';
    END IF;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `admins`
--

CREATE TABLE `admins` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Volcado de datos para la tabla `admins`
--

INSERT INTO `admins` (`id`, `nombre`, `email`, `password`) VALUES
(1, 'Larry Garcia', 'garcialarry575@gmail.com', 'Laxky0338c'),
(2, 'María Fernanda', 'mariafer.1575@gmail.com', '112233Mafe*');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `Appointments`
--

CREATE TABLE `Appointments` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `staff_id` int(11) NOT NULL,
  `appointment_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `status` enum('confirmed','cancelled') DEFAULT 'confirmed',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `Staff`
--

CREATE TABLE `Staff` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `role` enum('Entrenador','Fisioterapia','Admin','Spa') NOT NULL,
  `priority_order` int(11) DEFAULT '99',
  `is_active` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Volcado de datos para la tabla `Staff`
--

INSERT INTO `Staff` (`id`, `name`, `role`, `priority_order`, `is_active`) VALUES
(3, 'Adriana', 'Entrenador', 1, 1),
(4, 'Jorge Rodriguez', 'Entrenador', 2, 1),
(5, 'Ivan', 'Entrenador', 3, 1),
(6, 'Jonathan', 'Entrenador', 4, 1),
(7, 'David', 'Entrenador', 5, 1),
(8, 'Alexandra Mejia', 'Spa', 10, 1),
(9, 'Edna Rengifo', 'Fisioterapia', 11, 1),
(10, 'Mafe', 'Admin', 12, 1);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `Users`
--

CREATE TABLE `Users` (
  `id` int(11) NOT NULL,
  `USUARIO` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `F_INGRESO` date DEFAULT NULL,
  `F_VENCIMIENTO` date DEFAULT NULL,
  `PLAN` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ESTADO` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `N_CEDULA` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `F_N` date DEFAULT NULL,
  `EDAD` int(11) DEFAULT NULL,
  `SEXO` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `F_EXAMEN_LABORATORIO` date DEFAULT NULL,
  `F_CITA_NUTRICION` date DEFAULT NULL,
  `F_CITA_MED_DEPORTIVA` date DEFAULT NULL,
  `DIRECCION_O_BARRIO` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `TELEFONO` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `CORREO_ELECTRONICO` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `F_FIN_CONGELAMIENTO` date DEFAULT NULL,
  `F_INICIO_CONGELAMIENTO` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `Users`
--

INSERT INTO `Users` (`id`, `USUARIO`, `F_INGRESO`, `F_VENCIMIENTO`, `PLAN`, `ESTADO`, `N_CEDULA`, `F_N`, `EDAD`, `SEXO`, `F_EXAMEN_LABORATORIO`, `F_CITA_NUTRICION`, `F_CITA_MED_DEPORTIVA`, `DIRECCION_O_BARRIO`, `TELEFONO`, `CORREO_ELECTRONICO`, `F_FIN_CONGELAMIENTO`, `F_INICIO_CONGELAMIENTO`) VALUES
(1, 'Ana Maria Sanabria Clavijo', '2024-08-06', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1983-12-27', NULL, 'F', '2024-08-14', NULL, NULL, NULL, '3057135860', 'anamasanabria@hotmail.com', NULL, NULL),
(2, 'SANTIAGO LOPEZ', '2024-08-13', NULL, 'Experiencia fitnes', 'INACTIVO', NULL, '1981-07-01', NULL, 'M', '2024-08-13', NULL, NULL, NULL, '3224392359', 'lopezsantiago@hotmail.com', NULL, NULL),
(3, 'Diana Cardozo', '2024-08-13', NULL, 'Experiencia Fitness', 'INACTIVO', NULL, '1980-07-01', 44, 'F', '2024-08-15', NULL, NULL, NULL, '3176938727', 'dianamarcelac16@gmail.com', NULL, NULL),
(4, 'SANDRA BENITEZ', '2024-08-14', NULL, 'Experiencia Fitness plan básico + Perso', 'INACTIVO', NULL, '1996-04-09', 28, 'F', '2024-08-14', NULL, NULL, NULL, '3024640657', 'sandrabenitez1679@gmail.com', NULL, NULL),
(5, 'FERNANDO TRUJILLO', NULL, NULL, 'Experiencia fitnes plan de lujo + PERSO', 'ACTIVO', '9088155', '1952-01-12', 71, 'M', '2024-08-15', NULL, NULL, NULL, '3153192432', 'calamar89@hotmail.com', NULL, NULL),
(6, 'Enrique Mejia Fortich', '2024-08-02', NULL, 'Experiencia Fitness plan básico + Perso 2', 'ACTIVO', '14213171', '1952-08-19', 71, 'M', '2024-08-05', '2024-08-05', NULL, NULL, '3167424382', 'enrique.mejia@segurosmejia.co', NULL, NULL),
(7, 'Ricardo Mejia Fortich', '2024-08-02', NULL, 'Experiencia Fitness plan básico + Perso 2', 'ACTIVO', '14222198', '1958-01-15', 66, 'M', '2024-08-05', '2024-08-05', NULL, NULL, '3187171707', 'ricmejia78@hotmail.com', NULL, NULL),
(8, 'Ivan Andres Castro Ortiz', '2024-07-31', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1983-08-04', 40, 'M', NULL, NULL, '2024-07-31', NULL, '3208013224', 'castroortizivanandres@gmail.com', NULL, NULL),
(9, 'Monica Lineth Ordoñez Bernal', NULL, NULL, 'Experiencia Fitness', 'INACTIVO', '52350763', '1978-06-30', 46, 'F', '2024-07-31', NULL, NULL, NULL, '3212528680', 'monicaordonezbernal@gmail.com', NULL, NULL),
(10, 'Katherine Godoy Sabogal', '2024-07-30', NULL, 'Dr Poveda - Convenio', 'INACTIVO', NULL, NULL, NULL, NULL, '2024-07-16', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(11, 'Maria Isabel Aristizabal', '2024-07-30', NULL, 'Dr Poveda - Convenio', 'INACTIVO', NULL, NULL, NULL, NULL, '2024-07-24', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(12, 'Paola Alejandra Leal Perez', '2024-08-01', NULL, 'Experiencia fitnes plan de lujo', 'INACTIVO', NULL, '1996-10-15', 27, 'F', '2024-08-01', NULL, '2024-08-01', NULL, '3104212494', 'palealperez@gmail.com', NULL, NULL),
(13, 'Zahira Lucia Ruiz', '2024-07-30', NULL, 'Dr Poveda - Convenio', 'INACTIVO', NULL, NULL, NULL, 'F', '2024-07-05', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(14, 'Ricardo Jose Castillo Suz', '2024-07-30', NULL, 'Experiencia fitnes plan de lujo', 'INACTIVO', NULL, '1991-12-12', 32, 'M', '2024-08-01', NULL, '2024-08-01', NULL, '3007608870', 'ricardocastilloabogado@hotmail.com', NULL, NULL),
(15, 'Tatiana Carolina Guzman Sanchez', '2024-07-30', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1990-02-22', 34, 'F', '2024-08-30', NULL, '2024-08-30', NULL, '3058153366', 'karoguzman25@gmail.com', NULL, NULL),
(16, 'Diana Carolina Gutierrez Villarreal', '2024-07-29', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1981-01-01', 43, 'F', '2024-07-26', '2024-08-06', '2024-07-26', NULL, '3132764081', 'caro.gutierrez.villareal@hotmail.com', NULL, NULL),
(17, 'Sra. Alcira Russi', '2024-07-29', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, NULL, NULL, '2024-03-02', '2024-03-21', NULL, NULL, '3106797431', NULL, NULL, NULL),
(18, 'V. Sra Doris Russi', '2024-07-29', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '23548141', '1951-06-03', 73, 'F', '2024-03-02', '2024-03-21', NULL, NULL, '3108088683', 'dorisrussi@hotmail.com', NULL, NULL),
(19, 'Yery Lili Ospina Moreno', '2024-07-29', NULL, 'Experiencia fitnes plan basico', 'INACTIVO', NULL, '1980-11-20', 43, 'F', '2024-07-29', NULL, '2024-07-31', NULL, '3012256055', 'yerylilika77@gmail.com', NULL, NULL),
(20, 'Emma Helena Herrera Saldarriaga', '2024-07-29', NULL, 'Experiencia fitnes plan basico', 'INACTIVO', NULL, '1965-01-23', 59, 'F', '2024-07-29', NULL, '2024-07-29', NULL, '3226705618', 'hyhequipos@hotmail.com', NULL, NULL),
(21, 'Susana Andrea Betancurth Rendon', '2024-08-01', NULL, 'Experiencia fitnes plan basico', 'INACTIVO', NULL, '1988-04-15', 36, 'F', '2024-07-30', NULL, NULL, NULL, '3135007018', 'susy_betancourth@hotmail.com', NULL, NULL),
(22, 'Lupita Sibrian', '2024-07-24', NULL, 'Experiencia fitnes plan basico+personalizado', 'INACTIVO', NULL, '1978-12-08', 45, 'F', NULL, NULL, NULL, NULL, '7788624020', 'Lupita.sibrian@outlook.com', NULL, NULL),
(23, 'Monica Alejandra Rios', '2024-07-23', NULL, 'Experiencia fitnes plan de lujo', 'INACTIVO', NULL, '1986-09-28', 37, 'F', '2024-07-30', '2024-07-30', NULL, NULL, '3168485814', 'aleja.0928@hotmail.com', NULL, NULL),
(24, 'Liliana Torres Sanchez', '2024-07-20', NULL, 'Dr Poveda - Convenio', 'INACTIVO', NULL, NULL, NULL, 'F', '2024-07-09', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(25, 'Maria Olga Paez de Parra', '2024-08-28', NULL, 'Experiencia fitnes plan basico+personalizado', 'INACTIVO', '28536164', '1947-04-12', 77, 'F', '2024-07-22', NULL, NULL, NULL, '3135497597', 'axelap2@hotmail.com olguitapaez12@hotmail.com', NULL, NULL),
(26, 'Luzmila Castaño Serrato', NULL, NULL, '2 meses Experiencia Fitness plan básico+Personalizado', 'ACTIVO', NULL, '1952-09-08', 71, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(27, 'Diego Godoy Acosta', '2024-07-22', NULL, 'Experiencia fitnes', 'ACTIVO', '14395295', '1981-11-17', 42, 'M', '2024-07-19', NULL, NULL, NULL, '3212528680', 'cenproforest@gmail.com', NULL, NULL),
(28, 'Maria Camila Castro Rojas', '2024-07-18', NULL, 'Dr Poveda - Convenio', 'INACTIVO', NULL, '1995-02-25', 29, 'F', NULL, NULL, NULL, NULL, '3112400793', 'mariaca.castro@campusucc.edu.co', NULL, NULL),
(29, 'Angelica Maria Cardozo', '2024-06-11', NULL, 'Experiencia fitnes pla de lujo', 'ACTIVO', NULL, '1982-10-27', 41, 'F', '2024-06-12', '2024-06-20', NULL, NULL, '3156149432', 'cardozojuridica@gmail.com', NULL, NULL),
(30, 'Norida Palomino', '2024-06-06', NULL, 'Experiencia fitnes plan basico', 'INACTIVO', NULL, '1987-08-22', 36, 'F', '2024-06-12', '2024-06-24', NULL, NULL, '3105904723', 'norida228@hotmail.com', NULL, NULL),
(31, 'Maria Camila Medina', '2024-06-06', NULL, 'Experiencia fitnes plan basico', 'INACTIVO', NULL, '2000-11-03', 23, 'F', '2024-06-11', '2024-06-18', NULL, NULL, NULL, 'medinacamila050@gmail.com', NULL, NULL),
(32, 'Tatiana Rojas Bedoya', '2024-06-07', NULL, 'Experiencia fitnes plan basico', 'INACTIVO', NULL, '1997-12-16', 26, 'F', '2024-06-11', '2024-06-24', NULL, NULL, '3212489624', 'tatianarojasb.16@gmail.com', NULL, NULL),
(33, 'Andres Ortegon', NULL, NULL, 'Experiencia fitnes plan de lujo', 'INACTIVO', NULL, NULL, NULL, 'M', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(34, 'Camila Rincon', NULL, NULL, 'Experiencia fitnes plan de lujo', 'INACTIVO', NULL, NULL, NULL, 'F', '2024-05-06', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(35, 'Andres Felipe Alvarez', '2024-07-10', NULL, 'Experiencia Fitness de Lujo', 'INACTIVO', NULL, '1993-11-05', 30, 'M', '2024-07-16', '2024-07-22', '2024-07-16', NULL, '3155441417', 'andresalvarezinversiones@gmail.com', NULL, NULL),
(36, 'Maria Alejandra Diaz Larotta', '2024-07-10', NULL, 'Experiencia Fitness plan', 'INACTIVO', NULL, '1995-03-03', 29, 'F', '2024-07-16', '2024-07-26', NULL, NULL, '3133134052', 'aleja_diaz9503@hotmail.com', NULL, NULL),
(37, 'Leydy Salazar', '2023-11-20', NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', '65630115', '1984-09-24', 39, 'F', '2024-01-11', '2024-01-30', '2024-07-17', NULL, '3214727335', 'peteyleydy2014@gmail.com', NULL, NULL),
(38, '66 Alicia Tarquino Romero', '2024-01-09', NULL, 'Experiencia Fitness de Lujo', 'INACTIVO', '38241808', '2024-06-24', 64, 'F', '2024-01-10', '2024-01-12', '2024-07-26', NULL, '3002082643', 'aliciatarquinoromero@gmail.com', NULL, NULL),
(39, '888 Laura Cardozo', '2024-04-29', NULL, 'Experiencia Fitness de Lujo', 'INACTIVO', NULL, '1993-10-18', 30, 'F', '2024-05-02', '2024-05-09', '2024-07-29', NULL, '3013380674', 'LAURA_CARDOZOM@HOTMAIL.COM', NULL, NULL),
(40, 'Angie Catalina Cespedes Villareal', '2024-05-23', NULL, 'Experiencia Fitness de Lujo', 'INACTIVO', NULL, '1995-01-11', 27, 'F', '2024-06-06', '2024-06-13', NULL, NULL, '3144507581', 'CATA-VILLARREALM5@HOTMAIL.COM', NULL, NULL),
(41, 'Carlos Arturo Rugeles', '2024-06-04', NULL, 'Experiencia Fitness de lujo', 'INACTIVO', NULL, '1971-11-05', 53, 'M', '2024-06-04', '2024-07-15', NULL, NULL, '3214912605', 'crugelesc@gmail.com', NULL, NULL),
(42, 'Ana Milena Orjuela', '2024-06-17', NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', NULL, '1983-10-10', 40, 'F', '2024-06-18', '2024-06-14', NULL, NULL, '3107894037', NULL, NULL, NULL),
(43, 'William Cardona Hoyos', '2024-06-18', NULL, 'Experiencia Fitness de Lujo', 'INACTIVO', NULL, '1980-09-09', 43, 'M', '2024-06-18', '2024-07-02', NULL, NULL, '3167437672', 'william_cardona@yahoo.com', NULL, NULL),
(44, 'Estefany Valeria Bustos', '2024-07-03', NULL, 'Experiencia Fitness de Lujo', 'INACTIVO', NULL, '2000-04-22', 24, 'F', '2024-07-03', '2024-07-16', '2024-07-11', NULL, '3217304710', 'valeriabustosab@gmail.com', NULL, NULL),
(45, 'Juan David Lopez', '2024-07-05', NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', NULL, NULL, 26, NULL, '2023-12-04', '2024-01-18', NULL, NULL, '300 4080262', 'juandlopez628@gmail.com', NULL, NULL),
(46, 'Juan Carlos Herran Seyes', '2024-07-11', NULL, 'Experiencia Fitness de Lujo + Personalizado', 'INACTIVO', NULL, '1974-09-06', 49, 'M', '2024-07-10', '2024-07-15', '2024-07-10', NULL, '3182098072', 'industriaherranco@gmail.com', NULL, NULL),
(47, 'May Andrade', '2024-03-20', NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '1110481553', '1988-11-26', 35, 'M', '2024-03-21', '2024-04-08', NULL, NULL, '3178876856', 'may.morales521@gmail.com', NULL, NULL),
(48, 'Natalia Chavez', '2024-03-20', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', '110491308', '1990-10-02', 34, 'F', NULL, NULL, NULL, NULL, '3212832632', 'nati_chavez98@gmail.com', NULL, NULL),
(49, '6 Fernanda Luna', '2024-04-17', NULL, 'Experiencia Fitness plan basico', 'ACTIVO', NULL, '1980-09-24', 45, 'F', '2024-04-17', '2024-04-25', NULL, NULL, NULL, NULL, NULL, NULL),
(50, 'Mauricio Poveda', '2024-04-17', NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '80039829', '1982-12-04', 43, 'M', '2024-04-17', '2024-04-25', NULL, NULL, NULL, NULL, NULL, NULL),
(51, 'Alvaro Parra', '2024-04-24', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '1969-06-12', 55, 'M', '2024-04-30', '2024-05-16', NULL, NULL, '3168338058', NULL, NULL, NULL),
(52, 'Carlos Eduardo Avila', '2024-04-25', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', '93238161', '1985-02-19', 39, 'M', '2024-04-26', '2024-05-07', NULL, NULL, '3002163497', 'ceareinoso@gmail.com', NULL, NULL),
(53, '1 Andrea Trujillo', '2024-05-08', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '1992-06-27', 32, 'F', NULL, '2024-05-30', NULL, NULL, NULL, NULL, NULL, NULL),
(54, '1 German Ruiz', '2024-05-08', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '2024-11-25', NULL, 'M', NULL, '2024-05-30', NULL, NULL, NULL, NULL, NULL, NULL),
(55, '77 Jesus Rueda', '2024-05-15', NULL, 'Experiencia fitness plan basico', 'ACTIVO', NULL, '1992-10-22', 31, 'M', '2024-05-15', '2024-05-30', NULL, NULL, '3202147750', 'Ing.jesusrueda@.gmail.com', NULL, NULL),
(56, '77 Francys Perez', NULL, NULL, 'Experiencia fitness plan basico', 'ACTIVO', NULL, '1993-06-14', 31, 'F', '2024-05-20', '2024-05-30', NULL, NULL, NULL, 'Lic.francysperez@.gmail.com', NULL, NULL),
(57, 'Angie Vanessa Vieda', '2024-05-22', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '1998-06-07', 25, 'F', '2024-05-24', NULL, NULL, NULL, '3158845434', 'VANESSAVIEDA@HOTMAIL.COM', NULL, NULL),
(58, '2 Francisco Ivan Mejia', '2024-05-23', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '1962-09-14', 62, 'M', '2024-05-23', '2024-06-11', NULL, NULL, NULL, NULL, NULL, NULL),
(59, '2 Maria Eugenia Cuellar', '2024-05-23', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '1963-11-20', 60, 'F', '2024-05-23', '2024-06-11', NULL, NULL, '3208399374', 'MARIAEU2063@HOTMAIL.COM', NULL, NULL),
(60, 'Stevan Parra Torres', '2024-06-15', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '2005-11-15', 18, 'M', '2024-06-18', '2024-07-04', NULL, NULL, '3246841414', 'stsesa100@hotmail.com', NULL, NULL),
(61, 'Johanna Carolina Giraldo Alzate', '2024-07-22', NULL, 'Dr Poveda', 'INACTIVO', NULL, '1985-08-01', 39, 'M', '2024-07-08', NULL, NULL, NULL, '3152950023', 'johannacarolinagiraldo@hotmail.com', NULL, NULL),
(62, '11 Efren Leonardo Sosa Bonilla', '2024-07-21', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1993-11-11', NULL, 'M', '2024-07-19', '2024-07-22', '2024-07-19', NULL, '3214404983', 'efrenl.sosab@gmail.com', NULL, NULL),
(63, '11 Alexandra Quijano Saavedra', '2024-07-21', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1997-06-25', NULL, 'F', '2024-07-19', '2024-07-22', '2024-07-19', NULL, '3183837078', 'alex22quijano@gmail.com', NULL, NULL),
(64, 'Luisa Fernanda Bulla', '2024-07-22', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1996-03-18', 28, 'F', NULL, NULL, NULL, NULL, '3015044411', 'luisabulla1@hotmail.com', NULL, NULL),
(65, 'Esther Manuela Lopez Cardozo', '2024-07-17', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '2001-03-05', 23, 'F', NULL, NULL, NULL, NULL, '3168296286', 'manuelalopez124@gmail.com', NULL, NULL),
(66, 'Andrea Marcela Ortiz Rojas', '2024-07-12', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1996-08-28', 27, 'F', '2024-08-17', '2024-08-01', '2024-08-17', NULL, '3170195974', 'andreaamor28@hotmail.com', NULL, NULL),
(67, 'Angie Jasbleidy Librado Bernal', '2024-07-10', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1992-07-08', 32, 'F', '2024-07-10', '2024-07-29', '2024-07-16', NULL, '3043362599', 'anjalibe16@hotmail.com', NULL, NULL),
(68, 'Brigitte Caviedes Rodriguez', '2023-10-11', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1981-12-02', 42, 'F', NULL, NULL, NULL, NULL, '3202033747', 'caviedesbrigitte@gmail.com', NULL, NULL),
(69, 'Nestor Eduardo Guerrero', '2023-09-25', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1988-07-04', 35, 'M', NULL, NULL, NULL, NULL, '3102393867', 'negma_7@hotmail.com', NULL, NULL),
(70, '3 Andres Felipe Lievano', '2023-09-27', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1997-11-26', 25, 'M', '2023-09-27', '2023-10-02', NULL, NULL, '3147553813', 'Andreslievano0804@gmail.com', NULL, NULL),
(71, '3 Angela Gabriela Cantillo Suarez', '2023-09-27', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '2001-12-28', 28, 'F', '2023-09-27', '2023-10-02', NULL, NULL, '3104690503', 'Acantillosuarez9@gmail.com', NULL, NULL),
(72, '66 Jennifer Cifuentes', '2023-10-24', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1990-07-29', 33, 'F', '2023-10-24', NULL, '2024-07-10', NULL, '3004624431', 'jen_cifuentes@hotmail.com', NULL, NULL),
(73, '5 Camila Grisales', '2023-10-25', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1994-06-25', 30, 'F', '2023-10-25', NULL, NULL, NULL, '317 3775121', 'camilgri@hotmail.com', NULL, NULL),
(74, 'V. Alba Luz Russi', '2024-01-02', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '23555330', '1962-04-22', 61, 'F', '2024-01-02', NULL, NULL, NULL, '312 4985146', 'alba.russi@hotmail.com', NULL, NULL),
(75, 'V. Blanca Russi', '2024-01-02', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, NULL, 59, 'F', '2024-01-02', '2024-02-02', NULL, NULL, '323 5900959', 'blanrussi30@gmail.com', NULL, NULL),
(76, 'Maria Ema Ropero', '2024-01-29', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1944-04-17', 70, 'F', '2024-01-29', NULL, '2024-07-11', NULL, '3014086698', 'melytery7@gmail.com', NULL, NULL),
(77, '4 Andrés Felipe Canizales', '2024-01-29', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110480346', '1988-12-16', 38, 'M', '2024-02-03', NULL, NULL, NULL, '3143328547', 'Andrésfelipe_90210@hotmail.com', NULL, NULL),
(78, '4 Edna Lorena Romero', '2024-01-29', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1993-09-17', 33, 'F', '2024-02-03', NULL, NULL, NULL, '3105178986', 'lorenaromero1709@gmail.com', NULL, NULL),
(79, 'V. Gina Gonzalez', '2024-02-05', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1986-07-15', 37, 'F', '2023-12-28', '2024-02-29', NULL, NULL, NULL, 'ginagoru@gmail.com', NULL, NULL),
(80, '9 Isabella Gonzalez', '2024-02-06', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '2009-11-10', 14, 'F', '2024-02-08', '2024-02-29', NULL, NULL, '311 3342863', 'alejandrazsf2014@gmail.com', NULL, NULL),
(81, '9 Mauricio Gonzalez', '2024-02-06', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '93402123', '1976-11-25', 47, 'M', '2024-02-07', '2024-02-29', NULL, NULL, '321 7010601', 'magsolucionesautomaticas@gmail.com', NULL, NULL),
(82, 'Elizabeth Rodriguez Holguin', '2024-02-07', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1988-08-13', 35, 'F', '2024-02-08', '2024-02-16', NULL, NULL, '3196789288', 'elirholguin@gmail.com', NULL, NULL),
(83, 'Paula Andrea Casas', '2024-02-24', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '2003-11-23', 20, 'F', '2024-03-13', '2024-04-05', NULL, NULL, '3186838789', 'paulitacasas560@gmail.com', NULL, NULL),
(84, 'Delcy Isaza', '2024-03-02', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1978-08-05', 45, 'F', '2024-03-02', '2024-03-21', NULL, NULL, '3107847928', 'delcisaza@yahoo.com', NULL, NULL),
(85, 'Maria Isabel Santiago', '2024-03-02', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, NULL, 'F', '2024-03-02', '2024-04-05', NULL, NULL, '3007039597', 'mariaisabelsantiago29@gmail.com', NULL, NULL),
(86, 'Lina Maria Urquiza', '2024-03-12', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1996-11-01', 27, 'F', '2024-03-15', '2024-04-01', NULL, NULL, '3103352569', 'linaurquizac1@gmail.com', NULL, NULL),
(87, '888 Paula Cruz', '2024-03-14', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1994-02-23', 30, 'F', NULL, '2024-05-09', NULL, NULL, '3212585391', 'paulacruz94@hotmail.com', NULL, NULL),
(88, '2 Tomas Martinez', '2024-04-02', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '2012-12-14', 11, 'F', '2024-04-02', '2024-04-11', NULL, NULL, NULL, NULL, NULL, NULL),
(89, '2 Camilo Martinez', '2024-04-03', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '80214076', '1983-07-23', 40, 'F', '2024-04-03', '2024-04-11', NULL, NULL, '3107828656', NULL, NULL, NULL),
(90, '99 Paula Andrea Sanabria Góngora', '2024-04-23', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1996-06-06', 27, 'F', '2024-04-23', NULL, NULL, NULL, '3212338162', 'pausanabria96@hotmail.com', NULL, NULL),
(91, 'Adriana Maria Salazar Sanchez', '2024-04-29', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1988-12-12', 35, 'F', '2024-05-08', '2024-05-31', NULL, NULL, '3002427005', 'adrisalazarsantos@hotmail.com', NULL, NULL),
(92, 'Karla Penate CANADA', '2024-05-02', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, NULL, 'F', NULL, '2024-05-07', NULL, NULL, NULL, NULL, NULL, NULL),
(93, 'Kimberly Enciso', '2024-05-09', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1997-04-14', 29, 'F', '2024-05-09', '2024-05-23', NULL, NULL, '3186082041', 'KimberlyEncisojimenez@gmail.com', NULL, NULL),
(94, 'Maria Victoria Cardona Parra', '2024-05-14', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1974-09-19', 49, 'F', NULL, '2024-05-28', NULL, NULL, '3204888031', 'mavicarpa@gmail.com', NULL, NULL),
(95, 'Dana Fernanda Guzman', '2024-05-31', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1988-12-25', 35, 'F', '2024-06-05', NULL, NULL, NULL, '3219002192', 'D.GUZMAN.S1977@GMAIL.COM', NULL, NULL),
(96, 'Diana Carolina Aldana Delgado', '2024-06-01', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1994-06-17', 29, 'F', '2024-07-02', '2024-07-12', NULL, NULL, NULL, 'CAROLINAALDANAD@OUTLOOK,ES', NULL, NULL),
(97, 'Manuela Gonzales Suarez', '2024-06-13', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '2011-09-18', 12, 'F', '2024-06-13', '2024-07-09', NULL, NULL, '3184019104', 'nataly.suarez.barrera@gmail.com', NULL, NULL),
(98, 'Nataly Suarez Barrera', '2024-06-14', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1985-05-13', 39, 'F', '2024-06-14', '2024-07-09', NULL, NULL, '3184019104', 'nataly.suarez.barrera@gmail.com', NULL, NULL),
(99, 'Luisa Fernanda Castillo', '2024-06-15', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1999-10-16', 24, 'F', '2024-05-15', '2024-05-28', NULL, NULL, '3102668146', 'LUISA-FORERO@HOTMAIL.COM', NULL, NULL),
(100, 'Carol Tatiana Quesada Garcia', '2024-06-17', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1979-11-20', 44, 'F', '2024-06-17', '2024-06-27', NULL, NULL, '3008291322', 'victormanuelme03@gmail.com', NULL, NULL),
(101, 'Paula Victoria Perez Cardona', '2024-06-25', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1997-11-12', 26, 'F', '2020-06-26', '2024-07-08', NULL, NULL, NULL, 'paulavictoriaperezcardona@gmail.com', NULL, NULL),
(102, 'Diana Alvarado', '2024-06-26', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, NULL, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(103, 'Laura Victoria Caceres Perdomo', '2024-06-27', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1993-07-18', 30, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(104, 'Juan Sebastian Zapata', '2024-06-28', NULL, 'Experiencia Fitness plan básico', 'INACTIVO - no vive ibague', NULL, '2002-09-24', 21, 'M', '2024-07-02', '2024-07-12', NULL, NULL, '3108844536', 'juansebastianzc24@hotmail.com', NULL, NULL),
(105, 'Leidy Johanna Trujillo', '2024-07-04', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110449391', '1986-06-24', 38, 'F', '2024-07-04', '2024-07-25', '2024-07-08', NULL, '3002164695', 'trujillo.leidyj@gmail.com', NULL, NULL),
(106, 'Berta Paula Rivera Quiroz', '2024-07-05', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1968-05-03', 56, 'F', '2024-07-09', NULL, NULL, NULL, '3226552213', 'berta.pau@hotmail.com', NULL, NULL),
(107, 'Melissa Naranjo Vergara', '2024-07-05', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1997-02-11', 27, 'F', '2024-07-09', '2024-07-19', NULL, NULL, '3205350887', 'mely.naranjov@gmail.com', NULL, NULL),
(108, 'Carlos Eduardo Jimenez Canizales', '2024-07-08', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1988-08-27', 35, 'M', '2024-07-11', NULL, NULL, NULL, '3212199965', 'caedjimenez@utp.edu.co', NULL, NULL),
(109, 'Kelly Dayana Canacue Garcia', '2024-07-08', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1992-03-27', 32, 'F', '2024-07-11', NULL, NULL, NULL, '3213814426', 'canacueg92@gmail.com', NULL, NULL),
(110, 'Juan Manuel Echeverry Rojas', '2024-06-24', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1995-12-28', 28, 'M', '2024-06-21', '2024-07-02', NULL, NULL, '3054292806', 'juanma.echeverry.rojas@gmail.com', NULL, NULL),
(111, 'Juanita Cortes', '2024-05-14', NULL, 'Experiencia Fitness plan básico  Personalizado', 'INACTIVO', NULL, '1997-01-26', 27, 'F', '2024-05-14', '2024-06-21', NULL, NULL, '3209889589', 'JUANITACORTES562@GMAIL.COM', NULL, NULL),
(112, 'Estefania Escobar', '2024-07-10', NULL, 'Experiencia Fitness plan básico+ Personalizado', 'INACTIVO', NULL, '1985-10-12', 38, 'F', NULL, NULL, NULL, NULL, '3152119630', 'estefaniaescobar85@hotmail.com', NULL, NULL),
(113, 'Michael Nicholas Diaz Martinez', '2024-07-09', NULL, 'Experiencia Fitness plan básico+ Personalizado', 'ACTIVO', NULL, '1991-04-01', 33, 'M', '2024-07-08', '2024-07-25', NULL, NULL, '3195063363', 'm.michael.diaz@gmail.com', NULL, NULL),
(114, 'Juan Salvador Peña', '2024-06-14', NULL, 'Experiencia Fitness plan de lujo', 'INACTIVO', NULL, '2011-07-15', 12, 'M', '2024-06-17', '2024-07-05', NULL, NULL, NULL, NULL, NULL, NULL),
(115, 'Rossmayra Marulanda Bejarano', '2024-04-29', NULL, 'Experiencia Fitness plan lujo - Personalizado', 'INACTIVO', NULL, '1994-10-26', 29, 'F', '2024-04-29', '2024-05-06', '2024-07-11', NULL, '3232300636', 'rossmayra26@gmail.com', NULL, NULL),
(116, 'Maryori Serrano', '2024-08-14', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1975-04-18', 50, 'F', '2024-06-28', NULL, NULL, NULL, '3219716269', 'maryuri.serrano75@gmail.com', NULL, NULL),
(117, 'Steven Gonzalez', '2024-08-27', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', NULL, '1995-06-05', 29, 'M', '2024-08-29', NULL, NULL, NULL, '3172680716', 'stevengm45@gmail.com', NULL, NULL),
(118, 'Ana Maria Mendez Mendoza', '2024-09-03', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', '28680902', '1956-12-28', 67, 'F', '2024-09-03', NULL, NULL, NULL, '3184452756', 'anamariamendez624@gmail.com', NULL, NULL),
(119, 'Jhon Esper Toledo', '2024-09-02', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '2007-05-23', 17, 'M', NULL, NULL, NULL, NULL, '3118059959', 'jhonetoledo2305@gmail.com', NULL, NULL),
(120, 'Zharick Sanchez Guzman', '2024-09-06', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '2001-05-03', 23, 'F', '2024-09-06', '2024-09-05', NULL, NULL, '3016397843', 'zdsanchezg@ut.edu.co', NULL, NULL),
(121, 'Jhon Milton Rojas', '2024-09-16', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1968-01-10', 56, 'M', '2024-09-12', NULL, NULL, NULL, '3134198313', 'gerenciaandar@gmail.com', NULL, NULL),
(122, 'Ana Katherine Gongora Saavedra', '2024-09-12', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1983-08-19', 41, 'F', '2024-09-12', NULL, NULL, NULL, '3164468188', 'katisa2006@gmail.com', NULL, NULL),
(123, 'Juan David Parra', '2024-08-29', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, NULL, NULL, 'M', NULL, NULL, NULL, NULL, '3214443464', NULL, NULL, NULL),
(124, 'Oriadna Aide Montealegre Montealegre', '2024-09-17', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', NULL, '1997-07-24', 27, 'F', '2024-09-17', NULL, NULL, NULL, '3203432710', 'origotha7@gmail.com', NULL, NULL),
(125, 'Andres Mur', '2024-09-23', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1990-05-03', 34, 'M', '2024-09-20', NULL, '2024-09-20', NULL, '3505727902', 'andres-mur@life.com', NULL, NULL),
(126, 'Wendy Villanueva', '2024-09-23', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1993-09-09', 31, 'F', '2024-09-20', NULL, '2024-09-20', NULL, '3208705413', 'ing.wendy2709@gmail.com', NULL, NULL),
(127, 'Angela Cristina Builes Trujillo', '2024-09-12', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', '1080291292', '1987-10-01', 36, 'F', NULL, NULL, NULL, NULL, '3107800476', 'angela-builes@hotmail.com', NULL, NULL),
(128, 'Yaned Maritza Rodriguez', '2024-10-15', NULL, 'Experiencia Fitness plan de lujo', 'ACTIVO', NULL, '1981-09-10', 43, 'F', '2024-09-24', NULL, NULL, NULL, '3160503658', 'yanedmarirodriguezp@gmail.com', NULL, NULL),
(129, 'Wendy Guzman', '2024-09-30', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1997-04-05', 27, 'F', '2024-09-26', NULL, NULL, NULL, '3219464047', 'wensguzmang@outlook.es', NULL, NULL),
(130, 'Jenny Jimenez', '2024-09-30', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1993-10-03', 30, 'F', '2024-09-26', NULL, NULL, NULL, '3143601455', 'jc_jimenezm@outlook.com', NULL, NULL),
(131, 'Greisman Cifuentes', '2024-09-16', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', NULL, NULL, 63, 'M', '2024-09-16', NULL, NULL, NULL, '3002082633', NULL, NULL, NULL),
(132, 'Jhon James Vega', '2024-09-26', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', '12247197', '1985-05-31', 39, 'M', '2024-09-25', NULL, NULL, NULL, '3213393595', 'james.mdut@gmail.com', NULL, NULL),
(133, 'Nazly Diaz', '2024-09-27', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1979-03-06', 45, 'F', '2024-08-12', NULL, NULL, NULL, '3008412975', 'magicwoldnet@hotmail.com', NULL, NULL),
(134, 'Maria Mercedes Charry', '2024-09-29', NULL, 'Experiencia Fitness plan de lujo', 'INACTIVO', NULL, NULL, NULL, 'F', '2024-01-30', '2024-09-16', NULL, NULL, '3214765398', 'mariamercha76@hotmail.com', NULL, NULL),
(135, 'Ximena Puertas', '2024-09-30', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1992-07-07', 32, 'F', '2024-08-21', NULL, NULL, NULL, '3104573895', 'ximenapuertas0525@outlook.com', NULL, NULL),
(136, 'Luz Tovar', '2024-09-30', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', NULL, '1998-09-22', 26, 'F', '2024-10-01', NULL, NULL, NULL, '3154182438', 'luzetovarg@gmail.com', NULL, NULL),
(137, 'Daniela Barrera', '2024-10-02', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1999-07-07', 25, 'F', '2024-10-02', NULL, NULL, NULL, '3133665270', 'daniela.barrera.charry@gmail.com', NULL, NULL),
(138, 'David Francisco Rubio Rojas', '2024-10-02', NULL, 'Experiencia Fitness plan de lujo', 'INACTIVO', NULL, '1983-05-21', 41, 'M', '2024-10-02', NULL, NULL, NULL, '3214112904', 'david.rubio@dr.com', NULL, NULL),
(139, 'Sofia Barreto', '2024-10-02', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', '1128269616', '1987-02-25', 37, 'F', '2024-10-02', NULL, NULL, NULL, '3002128762', 'sofia250287@yahoo.com', NULL, NULL),
(140, 'Juliana Jurado Peña', '2024-10-02', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1988-10-22', 35, 'F', '2024-10-01', NULL, NULL, NULL, '3007445402', 'julianajurado@gmail.com', NULL, NULL),
(141, 'Olga Lucia Alfonso', '2024-10-01', NULL, 'Experiencia Fitness plan de lujo', 'ACTIVO', '51771859', '1965-03-17', 59, 'F', '2024-10-01', NULL, NULL, NULL, '3118988850', 'olalfonsoi@hotmail.com', NULL, NULL),
(142, 'Jennifer Pinto', '2024-10-07', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', NULL, '1990-10-16', 33, 'F', '2024-10-03', NULL, NULL, NULL, '3206233256', 'jp_mayorga@hotmail.com', NULL, NULL),
(143, 'Angela Sanchez', '2024-10-09', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1982-01-06', 42, 'F', NULL, NULL, NULL, NULL, '3002003937', 'angelasanchez.82@hotmail.com', NULL, NULL),
(144, 'Bibiana Espinoza', '2024-10-15', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1977-09-18', 47, 'F', NULL, NULL, NULL, NULL, '3188133042', 'yivian10@hotmail.com', NULL, NULL),
(145, 'Felipe Dussan', '2024-10-07', NULL, 'Experiencia Fitness plan de lujo + personalizado', 'ACTIVO', '5824038', '1980-06-16', 44, 'M', '2024-10-07', NULL, NULL, NULL, '3002190689', 'udussan@yahoo.com', NULL, NULL),
(146, 'Maria Del Pilar Vargas Acosta', '2024-10-05', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1980-06-23', 44, 'F', '2024-10-04', NULL, NULL, NULL, '3208981135', 'mapivara@yahoo.com', NULL, NULL),
(147, 'Mauricio Londoño', '2024-10-07', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', '5819383', '1979-09-01', 45, 'M', '2024-10-07', NULL, NULL, NULL, '3188096109', 'vivi290580@gmail.com', NULL, NULL),
(148, 'Martin Barrera Charry', '2024-10-07', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '2012-04-23', 12, 'M', '2024-10-05', NULL, NULL, NULL, '3214765398', 'mariamercha76@hotmail.com', NULL, NULL),
(149, 'Mauricio Palma', '2024-10-07', NULL, 'Experiencia Fitness Plan Basico + Personalizado', 'INACTIVO', NULL, '1897-09-15', 37, 'M', '2024-10-07', NULL, NULL, NULL, '3144520965', 'mauricio1509@hotmail.com', NULL, NULL),
(150, 'Jose Ortiz Torres', '2024-10-07', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1992-09-16', 32, 'M', '2024-10-08', NULL, NULL, NULL, '3014857133', 'jota9216@hotmail.com', NULL, NULL),
(151, 'Ana Ider Rojas', '2024-10-16', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1969-11-22', 54, 'F', '2024-10-15', NULL, NULL, NULL, '3115135592', 'anitar281@hotmail.com', NULL, NULL),
(152, 'David Santiago Nova Rodriguez', '2024-10-23', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '2016-03-22', 8, 'M', '2024-10-21', NULL, NULL, NULL, '3160503658', 'yanedmarirodriguezp@gmail.com', NULL, NULL),
(153, 'Diana Marcela Barreto', '2024-10-21', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', '28552929', '1982-03-29', 42, 'F', NULL, NULL, NULL, NULL, '3002204604', 'marcelabarretoparra@hotmail.com', NULL, NULL),
(154, 'Elena Callejas', '2024-10-21', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', '52409787', '1979-10-27', 44, 'F', '2024-10-17', NULL, NULL, NULL, '3042910916', 'hele_1027@hotmail.com', NULL, NULL),
(155, 'Jaison Caro Tafur', '2024-10-23', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1977-11-07', 46, 'M', '2024-10-30', NULL, NULL, NULL, '3212107929', 'jaison.caro@gmail.com', NULL, NULL),
(156, 'Diego Marmolejo', '2024-10-25', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', '93375409', '1977-03-27', 47, 'M', '2024-09-20', NULL, NULL, NULL, '3507172971', 'diegomarmolejo@gmail.com', NULL, NULL),
(157, 'Fabian Andres Pulido', '2024-11-07', NULL, 'Experiencia Fitness plan de lujo', 'ACTIVO', '1800888', '1979-09-12', 45, 'M', NULL, NULL, NULL, NULL, '3106989498', 'fpulido12@gmail.com', NULL, NULL),
(158, 'Felipe Bahamon', '2024-10-29', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1984-12-24', 39, 'M', NULL, NULL, NULL, NULL, '3106196652', 'pipebahamon@hotmail.com', NULL, NULL),
(159, 'Laura Medina', '2024-11-01', NULL, 'Experiencia Fitness plan de lujo', 'INACTIVO', NULL, '1993-06-04', 31, 'F', '2024-11-06', NULL, NULL, NULL, '3123251256', 'lauradanielamedinag@gmail.com', NULL, NULL),
(160, 'Jaime Fernando Hernandez', '2024-11-06', NULL, 'Experiencia Fitness plan de fitness', 'INACTIVO', NULL, '1974-04-18', 50, 'M', '2024-11-05', NULL, NULL, NULL, '3167442472', 'fernando_hernandezo@yahoo.com', NULL, NULL),
(161, 'Adriana Tovar', '2024-12-08', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', '38362337', '1983-08-09', 41, 'F', '2024-11-08', NULL, NULL, NULL, '3183621000', 'adrianatovarseguros@hotmail.com', NULL, NULL),
(162, 'Lorena Barrios', NULL, NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1987-02-03', 37, 'F', '2024-11-07', NULL, NULL, NULL, '3002616407', 'lorenabarrios0304@hotmail.com', NULL, NULL),
(163, 'Monica Gutierrez', NULL, NULL, 'Experiencia Fitness plan de lujo', 'ACTIVO', NULL, '1990-10-06', 34, 'F', '2024-11-22', NULL, NULL, NULL, '3175438721', 'monica_gutierrezp@hotmail.com', NULL, NULL),
(164, 'Camilo Espitia', '2024-11-25', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, 40, NULL, '2024-01-24', '2024-02-06', NULL, NULL, '3152789050', 'marthapalaciosuribe@gmail.com', NULL, NULL),
(165, 'Maria Alejandra Espitia Palacios', '2024-11-25', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, 12, NULL, '2024-01-16', '2024-02-06', NULL, NULL, '3152789050', 'mariaalejandaespitiapalacion@gmail.com', NULL, NULL),
(166, 'Maria Camila Espitia Palacios', '2024-11-25', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, 6, NULL, '2024-01-18', '2024-02-06', NULL, NULL, '3152789050', 'marthapalaciosuribe@hotmail.com.com', NULL, NULL),
(167, 'Ronald Suarez', '2024-11-26', NULL, 'Experiencia fitnes', 'INACTIVO', NULL, '1984-05-09', 40, NULL, NULL, NULL, NULL, NULL, '3114179370', 'ronaldsuarezu57@gmail.com', NULL, NULL),
(168, 'William Caina', '2024-11-28', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '79794193', '1975-10-10', 49, 'M', '2024-11-28', NULL, NULL, NULL, '3007978856', 'willicaina@hotmail.com', NULL, NULL),
(169, 'Leyla Gallego', '2024-12-02', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65748527', NULL, 54, 'F', NULL, NULL, NULL, NULL, '3173319705', 'lelogallego@hotmail.com', NULL, NULL),
(170, 'Natalia Quijano', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '3103637406', NULL, NULL, NULL),
(171, 'Jesus Pinzon', '2024-11-29', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, NULL, NULL, 'M', '2024-12-02', NULL, NULL, NULL, '3168763438', NULL, NULL, NULL),
(172, 'Maryam Lewis', '2024-12-04', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1983-11-14', 41, 'F', '2024-12-09', NULL, NULL, NULL, '3004924219', 'maryamlewis@gmail.com', NULL, NULL),
(173, 'Gabriela Manrique', '2024-12-10', NULL, 'Experiencia Fitness Plan Basico + Personalizado', 'ACTIVO', NULL, '2009-08-18', 15, 'F', '2024-12-12', NULL, NULL, NULL, '3112042400', 'mchavarroc@gmail.com', NULL, NULL),
(174, 'Mario Rodriguez', '2024-12-11', NULL, 'Experiencia Fitness Plan Basico + Personalizado', 'ACTIVO', NULL, '1955-05-18', 69, 'M', '2024-12-13', NULL, NULL, NULL, '3112493497', 'arqmariorodriguez@yahoo.es', NULL, NULL),
(175, 'Lina Arbarello', '2024-12-11', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65751988', '1971-04-20', 53, 'F', '2024-12-13', NULL, NULL, NULL, '3138539848', 'lalbarello71@yahoo.es', NULL, NULL),
(176, 'Andrea Carolina Bobadilla', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '3176582862', NULL, NULL, NULL),
(177, 'Marisol Guzman', '2024-12-17', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '28554787', '1982-06-22', 42, 'F', NULL, NULL, NULL, NULL, '3133244657', 'marisolguzmanmurillo@gmail.com', NULL, NULL),
(178, 'Olga Lucia Chaves', NULL, NULL, 'Experiencia Fitness plan de lujo', 'ACTIVO', '38254265', '1962-11-15', 62, 'F', '2024-12-11', NULL, NULL, NULL, '3174282185', 'ochavestorres@hotmail.com', NULL, NULL),
(179, 'Jose Ricardo Orozco', '2025-01-07', NULL, 'Experiencia Fitness plan de lujo+Personalizado', 'INACTIVO', NULL, NULL, NULL, 'M', '2025-01-08', NULL, NULL, NULL, '3183383253', 'hjorior@yahoo.com', NULL, NULL),
(180, 'Ricardo Jose Castillo Suz', NULL, NULL, 'Experiencia Fitness plan de lujo', 'INACTIVO', NULL, '1991-12-12', 33, 'M', NULL, NULL, NULL, NULL, '3007608870', 'ricardocastilloabogado@hotmail.com', NULL, NULL),
(181, 'Sebastian Zapata', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, 21, 'M', '2024-07-02', NULL, NULL, NULL, '3108844536', NULL, NULL, NULL),
(182, 'Oriadna Aide Montealegre Montealegre', NULL, NULL, 'Experiencia fitness plan basico', 'ACTIVO', '1110583926', '1994-01-24', 28, 'F', NULL, NULL, NULL, NULL, '3203432710', 'origotha7@gmail.com', NULL, NULL),
(183, 'Edna Lorena Romero', NULL, NULL, 'Experiencia fitness plan basico', 'ACTIVO', '1110539355', NULL, 31, 'F', NULL, NULL, NULL, NULL, '3105178986', NULL, NULL, NULL),
(184, 'Luz Tovar', NULL, NULL, 'Experiencia fitness plan basico', 'ACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(185, 'Andres Mur', '2024-10-23', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', '1110496996', '1990-05-03', 34, 'M', NULL, NULL, NULL, NULL, '3505727902', 'andres-mur@live.com', NULL, NULL),
(186, 'Juan Manuel Echeverry Rojas', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', '1047485096', '1995-12-28', 29, 'M', NULL, NULL, NULL, NULL, '3054292806', NULL, NULL, NULL),
(187, 'Francys Perez', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '162028221', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '4246760624', NULL, NULL, NULL),
(188, 'Angie Jasbleidy Librado Bernal', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '1110524542', '1992-07-08', 33, 'F', NULL, NULL, NULL, NULL, '3043362599', 'a', NULL, NULL),
(189, 'Sandra Benitez', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', '1110570101', '1994-04-09', 29, 'F', NULL, NULL, NULL, NULL, '3024640657', 'sandrabenitez1679@gmail.com', NULL, NULL),
(190, 'Greisman Cifuentes', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '14237638', '1961-08-26', 64, 'M', NULL, NULL, NULL, NULL, '3002082633', 'curados@gmail.com', NULL, NULL),
(191, 'Isabella Gonzalez', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', '1110798539', '2009-11-10', 15, 'F', NULL, NULL, NULL, NULL, NULL, 'alejandrazsf2014@gmail.com', NULL, NULL),
(192, 'Ross Maira Marulanda', NULL, NULL, 'Experiencia Fitness plan Lujo + Personalizado', 'INACTIVO', '1110552662', '1994-10-26', 31, 'F', '2024-09-11', NULL, NULL, NULL, '3232300636', 'Rossmayra26@gmail.com', NULL, NULL),
(193, 'Paula Cruz', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(194, 'Ricardo Jose Castillo Suz', NULL, NULL, 'Experiencia Fitness plan de lujo', 'ACTIVO', '1110518095', NULL, 32, 'M', '2025-08-01', NULL, NULL, NULL, '3007608870', NULL, NULL, NULL),
(195, 'Jhon Esper Toledo', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(196, 'Luisa Fernanda Bulla', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(197, 'Andres Felipe Lievano', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '11105876536', '1997-11-26', NULL, 'M', NULL, NULL, NULL, NULL, '3147553813', 'andreslievano0804@gmail.com', NULL, NULL),
(198, 'Gabriela Cantillo Suarez', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '1004355097', '2001-12-28', NULL, 'F', NULL, NULL, NULL, NULL, '3104690503', 'acantillosuarez9@gmail.com', NULL, NULL),
(199, 'Jennifer Cifuentes', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '1018436848', '1990-07-29', NULL, 'F', NULL, NULL, NULL, NULL, '3004624431', NULL, NULL, NULL),
(200, 'Juanita Cortes', NULL, NULL, 'Experiencia Fitness plan basico + Personalizado', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(201, 'Stiven Gonzales', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '1110561162', '1995-06-05', NULL, 'M', NULL, NULL, NULL, NULL, '3172680716', 'stevengm45@gmail.com', NULL, NULL),
(202, 'Ximena Puertas', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(203, 'Daniela Barrera', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(204, 'Laura Medina', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(205, 'Jaime Fernando Hernandez', NULL, NULL, 'Experiencia Fitness', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(206, 'Mario Rodriguez', NULL, NULL, 'Experiencia Fitness plan basico+personalizado', 'ACTIVO', '19284320', '1955-05-18', 70, 'M', NULL, NULL, NULL, NULL, '3112493497', 'arqmariorodriguez@yahoo.es', NULL, NULL),
(207, 'Jorge hernando Cruz', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', '93361263', '1965-02-08', 59, 'M', '2025-01-21', NULL, NULL, NULL, '3212690266', 'cruzjorgehernandez@gmail.com', NULL, NULL),
(208, 'Pilar Ardila', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', '1110450946', '1986-08-21', 38, 'F', '2025-01-21', NULL, NULL, NULL, '3197346281', 'pilarardila02@gmail.com', NULL, NULL),
(209, 'Laura lorena Pinto', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '1995-07-07', 29, 'F', NULL, NULL, NULL, NULL, '3123411911', 'lorenapinto0795@hotmail.com', NULL, NULL),
(210, 'juanita Arteaga ospina', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '1986-10-22', 38, 'f', '2025-01-20', NULL, NULL, NULL, '3115596949', 'juanitarteaga@gmail.com', NULL, NULL),
(211, 'Maria Alejandra Rodriguez Ospina', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', NULL, '1995-12-03', 29, 'F', '2025-01-20', NULL, NULL, NULL, '3178359743', 'maleja_rod@hotmail.com', NULL, NULL),
(212, 'Luisa Fernanda Triana Guzman', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '38141485', '1980-09-07', 44, 'F', '2024-10-31', NULL, NULL, NULL, '3115531392', 'luisatriana80@gmail.com', NULL, NULL),
(213, 'Nicolas Rodriguez Albarello', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', NULL, '1998-11-14', 26, 'M', '2025-01-23', NULL, NULL, NULL, '3144907334', 'nicolas1114@hotmail.com', NULL, NULL),
(214, 'Valentina Aranzazu', NULL, NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(215, 'Maria Camila Grisales', '2023-10-25', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110548374', '1994-06-25', 29, NULL, '2023-10-25', NULL, NULL, NULL, '317 3775121', 'camilgri@hotmail.com', NULL, NULL),
(216, 'Esteban Robayo Rodriguez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '2008-07-04', 16, 'M', '2025-01-27', NULL, NULL, NULL, '3053715704', 'mdjlrr3@gmail.com', NULL, NULL),
(217, 'Alejandra Prada Marmolejo', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110518108', '1991-12-12', 33, 'F', '2025-01-24', NULL, NULL, NULL, '3043752729', 'alejandrapradamgmail.com', NULL, NULL),
(218, 'Jorge Lara Salinas', '2025-03-03', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '79334599', '1965-02-05', 60, 'M', NULL, NULL, NULL, NULL, '3155183440', 'jlarasainas@hotmail.com', NULL, NULL),
(219, 'Andres Garcia', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '14136418', '1983-01-03', 41, 'M', '2025-01-08', NULL, NULL, NULL, '317 5166467', 'sndremv84@hotmail.com', NULL, NULL),
(220, 'Ana Milena Orjuela', NULL, NULL, 'Experiencia Fitness plan de lujo', 'ACTIVO', '52747445', NULL, NULL, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(221, 'Jesus Rueda', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '162028221', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(222, 'Jhon Jairo Nova', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '93405969', '1977-10-04', 47, 'M', NULL, NULL, NULL, NULL, '3167822188', 'jhonjaironovavelazques@gmail.com', NULL, NULL),
(223, 'Daniel Templeton', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110573021', '1996-07-20', 28, 'M', NULL, NULL, NULL, NULL, NULL, 'dtemvas1@gmail.com', NULL, NULL),
(224, 'Luisa Castillo', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1234645846', '1999-10-16', 25, 'F', NULL, NULL, NULL, NULL, '3102668146', 'luisa-forero@hotmail.com', NULL, NULL),
(225, 'Michael Nicholas Diaz Martinez', NULL, NULL, 'Experiencia Fitness plan Lujo', 'ACTIVO', '1110509378', '1991-04-01', 33, 'M', NULL, NULL, NULL, NULL, '3195063363', 'M.NICHOLAS.DIAZ@GMAIL.COM', NULL, NULL),
(226, 'Juan Diego Talero', NULL, NULL, 'Experiencia Fitness plan Lujo', 'INACTIVO', '1105470503', '2010-02-24', 15, 'M', NULL, NULL, NULL, NULL, '3158733356', 'lilianaperillamar@gmail.com', NULL, NULL),
(227, 'Yesid Sanchez Jimenez', '2023-10-09', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '7545554', '2024-07-13', 60, 'M', NULL, NULL, NULL, NULL, '3114624075', 'pispa1@icloud.com', NULL, NULL),
(228, 'KaroL Quintero', '2023-10-27', NULL, 'Embajadora', 'ACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(229, 'Oscar Barreto', '2023-11-26', NULL, 'Experiencia Fitness de Lujo', 'INACTIVO', NULL, NULL, 62, NULL, '2023-11-23', NULL, NULL, NULL, NULL, 'davidlopez972010@gmail.com', NULL, NULL),
(230, 'Fernanda Luna', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '28544731', '1980-09-24', 44, 'F', NULL, NULL, NULL, NULL, NULL, 'fernandaluna1980@hotmail.com', NULL, NULL),
(231, 'Maria Camila Grisales', NULL, NULL, 'Experiencia Fitness plan basico+personalizado', 'INACTIVO', '1110548374', '1994-06-26', NULL, 'F', NULL, NULL, NULL, NULL, NULL, 'camilgri@hotmail.com', NULL, NULL),
(232, 'Andrea Marcela Ortiz Rojas', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110575856', '1996-08-28', 28, 'F', NULL, NULL, NULL, NULL, NULL, 'andreaamor28@hotmail.com', NULL, NULL),
(233, 'Andres Mur', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110496996', '2025-05-03', 34, 'M', NULL, NULL, NULL, NULL, NULL, 'andres-mur@live.com', NULL, NULL),
(234, 'Sandra Benitez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110570101', '1994-04-09', 31, 'F', NULL, NULL, NULL, NULL, NULL, 'sandrabenitez1679@gmail.com', NULL, NULL),
(235, 'Oriadna Aide Montealegre', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110583926', '1997-07-24', 25, 'F', NULL, NULL, NULL, NULL, NULL, 'origotha7@gmail.com', NULL, NULL),
(236, 'Isabella Gonzalez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1107980539', '1905-07-02', 15, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(237, 'Ross Maira Marulanda', NULL, NULL, 'Experiencia Fitness plan Lujo+personalizado', 'ACTIVO', '1110552662', NULL, NULL, 'F', NULL, NULL, NULL, NULL, NULL, 'rossmayra26@gmail.com', NULL, NULL),
(238, 'Michael Nicholas Diaz Martinez', NULL, NULL, 'Experiencia Fitness plan Lujo', 'ACTIVO', '1110509378', '1991-04-01', 33, 'M', NULL, NULL, NULL, NULL, NULL, 'M.NICHOLAS.DIAZ@GMAIL.COM', NULL, NULL),
(239, 'Lida Mayerly Murillo', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '38144421', '1981-01-24', 44, 'F', NULL, NULL, NULL, NULL, NULL, 'maye.murillo@hotmail.com', NULL, NULL),
(240, 'Liliana Soler', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '65769841', '1976-01-17', 49, 'F', NULL, NULL, NULL, NULL, NULL, 'monitalili@hotmail.com', NULL, NULL),
(241, 'Sandra Lucia Urrego', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '41944035', '1979-06-13', 45, 'F', NULL, NULL, NULL, NULL, '3167625855', 'luciaurrego@gmail.com', NULL, NULL),
(242, 'Viviana Gomez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '38140258', '1980-05-29', 45, 'F', NULL, NULL, NULL, NULL, NULL, '290580@GMAIL.COM', NULL, NULL),
(243, 'Tomas Martinez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1104950725', '2012-12-12', 13, 'M', NULL, NULL, NULL, NULL, NULL, 'camilo.martinez@las2ms', NULL, NULL);
INSERT INTO `Users` (`id`, `USUARIO`, `F_INGRESO`, `F_VENCIMIENTO`, `PLAN`, `ESTADO`, `N_CEDULA`, `F_N`, `EDAD`, `SEXO`, `F_EXAMEN_LABORATORIO`, `F_CITA_NUTRICION`, `F_CITA_MED_DEPORTIVA`, `DIRECCION_O_BARRIO`, `TELEFONO`, `CORREO_ELECTRONICO`, `F_FIN_CONGELAMIENTO`, `F_INICIO_CONGELAMIENTO`) VALUES
(244, 'Luis fernando Rincon', NULL, NULL, 'Experiencia Fitness plan Lujo', 'ACTIVO', '14215090', '1951-11-01', 73, 'M', NULL, NULL, NULL, NULL, NULL, 'lfr51@hotmail.com', NULL, NULL),
(245, 'Ricardo Ramirez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '14219291', '1905-05-12', 66, 'M', NULL, NULL, NULL, NULL, '3153208067', 'ricardoramirezarango@hotmail.com', NULL, NULL),
(246, 'Lorena Pinto', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110560622', '1995-07-07', 29, 'F', NULL, NULL, NULL, NULL, '3123419411', 'lorenapinto0795@hotmail.com', NULL, NULL),
(247, 'Milena Chavarro', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, NULL, NULL, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(248, 'Juan Jose Manrique', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '79793864', NULL, 46, 'M', NULL, NULL, NULL, NULL, NULL, 'juanj_manrique@yahoo.con', NULL, NULL),
(249, 'Maria Alejandra Rodriguez Ospina', NULL, NULL, 'Experiencia Fitness plan Lujo', 'ACTIVO', '1110565875', '1995-12-03', 29, 'F', NULL, NULL, NULL, NULL, '3178359743', 'maleja_rod@hotmail.com', NULL, NULL),
(250, 'Nicolas  Rodriguez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110594600', '1998-11-14', 26, 'M', NULL, NULL, NULL, NULL, '3144907334', 'nicolas1114@hotmail.com', NULL, NULL),
(251, 'Esteban Robayo Rodriguez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '11105467909', '2008-07-04', 16, 'M', NULL, NULL, NULL, NULL, '3053715704', 'mdjlrr3@gmail.com', NULL, NULL),
(252, 'Alejandra Prada Marmolejo', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110518108', '1991-12-12', 33, 'F', NULL, NULL, NULL, NULL, '3043752729', 'alejandrapradam@gmail.com', NULL, NULL),
(253, 'Luisa Castillo', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1234645846', '1999-10-16', 25, 'F', NULL, NULL, NULL, NULL, '3102668146', 'luisa-forero@hotmail.com', NULL, NULL),
(254, 'CESAR VEJARANO', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '93411920', '1979-02-17', 46, 'M', NULL, NULL, NULL, NULL, '3004449075', 'w_s.cesar@outlook.com', NULL, NULL),
(255, 'ANDREA RINCON', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '52816111', '1982-10-03', 42, 'F', NULL, NULL, NULL, NULL, '3005380930', 'handreita103@hotmail.com', NULL, NULL),
(256, 'EMILIO VASQUEZ', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1104834831', '2014-05-13', 10, 'M', NULL, NULL, NULL, NULL, '32123001639', 'juancvg@hotmail.com', NULL, NULL),
(257, 'Andres Mendez', NULL, NULL, 'Experiencia Fitness plan Lujo', 'INACTIVO', NULL, NULL, NULL, 'M', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(258, 'DANIEL TEMPLATON', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, NULL, 'M', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(259, 'OSCAR GALLEGO VARON', NULL, NULL, 'Experiencia Fitness plan Lujo', 'INACTIVO', NULL, NULL, NULL, 'M', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(260, 'KAREN VARON', NULL, NULL, 'Experiencia Fitness plan Lujo', 'INACTIVO', NULL, NULL, NULL, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(261, 'Sergio Rubio', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, NULL, 'M', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(262, 'Alejandra   Ospina', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, NULL, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(263, 'Lina Fernanda Gualtero', NULL, NULL, 'Experiencia Fitness plan Lujo', 'INACTIVO', NULL, NULL, NULL, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(264, 'VIVIANA GOMEZ', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, NULL, NULL, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(265, 'Jorge Lara Salinas', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, NULL, 'M', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(266, 'Andres Garcia', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, NULL, NULL, 'M', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(267, 'Juan Diego Talero', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1105470503', '2010-02-24', 15, 'M', NULL, NULL, NULL, NULL, NULL, 'lilianaperillamar@gmail.com', NULL, NULL),
(268, 'Yaldrin Valentina', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1104544413', '2004-01-07', 20, 'F', '2025-01-10', NULL, NULL, NULL, '3153850798', 'yaldrinmendoza@gmail.com', NULL, NULL),
(269, 'Catalina Ibeth Moreno Rincón', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '65705686', '1979-02-04', 46, 'F', '2025-03-17', NULL, NULL, NULL, '3113007539', 'catalinaibeth@hotmail.com', NULL, NULL),
(270, 'Diego Guzman', NULL, NULL, 'Experiencia Fitness plan básico+Personalizado', 'INACTIVO', '93632877', '1965-09-06', 59, 'M', NULL, NULL, NULL, NULL, NULL, 'dieferguzga@hotmail.com', NULL, NULL),
(271, 'Elizabeth Santos Roa', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '65746858', '1970-08-15', 54, 'F', NULL, NULL, NULL, NULL, '3114860072', 'santoroa@yahoo.com', NULL, NULL),
(272, 'Carlos Carvajal Ramirez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1105677753', '1989-03-07', 36, 'M', NULL, NULL, NULL, NULL, '3106598428', 'gerenciacacr@gmail.com', NULL, NULL),
(273, 'Maria Alejandra Rivera', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1020718923', '1986-07-26', 38, 'F', '2025-02-20', NULL, NULL, NULL, '3208088920', 'marialeja_13@hotmail.com', NULL, NULL),
(274, 'Angelica Maria Cruz', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '52841501', '1981-12-20', 43, 'F', '2025-03-19', NULL, NULL, NULL, '3162314560', 'angelica@torrenegra.co', NULL, NULL),
(275, 'Sandra Benitez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110570101', '2025-04-09', 29, 'F', NULL, NULL, NULL, NULL, '3024640657', 'sandrabenitez1679@gmail.com', NULL, NULL),
(276, 'Angélica Maria García', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110478033', '1988-07-23', 37, 'F', '2025-03-28', NULL, NULL, NULL, '3168730751', 'amagapra@hotmail.com', NULL, NULL),
(277, 'Daniel felipe Sanchez', NULL, NULL, 'Experiencia Fitness plan básico+Personalizado', 'ACTIVO', '1193105997', '2001-03-31', 24, 'M', '2025-04-02', NULL, NULL, NULL, '3188674755', 'correosanchez099@gmail.com', NULL, NULL),
(278, 'Lorena Pinto', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110560622', NULL, 29, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(279, 'Angie Librado', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, NULL, 32, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(280, 'Danna Lucia Valderrama', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110050133', '2011-06-10', 13, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(281, 'JOSE ANTONIO ARDILA', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '93358441', '1964-09-25', 62, 'M', NULL, NULL, NULL, NULL, '3125877121', 'tamaleymastamalesibague@hotmail.com', NULL, NULL),
(282, 'PEDRO MARQUEZ', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1018456683', '1992-11-20', 32, 'M', NULL, NULL, NULL, NULL, NULL, 'pedro@uvushi.com', NULL, NULL),
(283, 'LISETH DELGADO', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1019146422', '1999-01-26', 26, 'F', NULL, NULL, NULL, NULL, NULL, 'LIVADELDI@GMIL.COM', NULL, NULL),
(284, 'Angela Bibiana Ordus García', NULL, NULL, 'Experiencia Fitness plan Lujo', 'INACTIVO', '53032219', '1985-11-12', 39, 'F', NULL, NULL, NULL, NULL, '3186639765', 'talentosrecreacion@gmail.com', NULL, NULL),
(285, 'Carlos Andres Ortiz Pinto', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1032417411', '1988-06-29', 36, 'M', NULL, NULL, NULL, NULL, '3208426740', 'cortizp1@gmail.com', NULL, NULL),
(286, 'DIANA BONILLA', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110443052', NULL, 39, 'F', NULL, NULL, NULL, NULL, '3162310561', 'dicarobh59@gmail.com', NULL, NULL),
(287, 'HEILER DAVID PINZÓN', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1105467973', NULL, 16, 'M', NULL, NULL, NULL, NULL, '3167000510', 'heidapizz@gmail.com', NULL, NULL),
(288, 'Maximiliano Reyes Ruiz', NULL, NULL, 'Experiencia Fitness plan básico+personalizado', 'INACTIVO', '1106231313', '2018-05-22', 7, 'M', NULL, NULL, NULL, NULL, '3112128944', 'familiareyesruiz1@gmail.com', NULL, NULL),
(289, 'Clarita Ximena Rojas Gil', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65772998', '1976-06-14', 48, 'F', NULL, NULL, NULL, NULL, '3005518902', 'claritagrg@yahoo.com', NULL, NULL),
(290, 'Andres Duran', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '93397820', '1975-11-23', 49, 'M', NULL, NULL, NULL, NULL, '3043943498', 'aduran71@yahoo.com', NULL, NULL),
(291, 'Maritza Palacio', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '38256283', '1960-12-11', 64, 'F', NULL, NULL, NULL, NULL, '3143965260', 'rmpc1160@gmail.com', NULL, NULL),
(292, 'Roberto Torres', NULL, NULL, 'Experiencia Fitness plan Lujo+personalizado', 'ACTIVO', '1018456240', '1992-11-19', 32, 'M', NULL, NULL, NULL, NULL, '3057852186', 'robertotorresabadia@gmail.com', NULL, NULL),
(293, 'Sara Sofia Cardozo Vera', NULL, NULL, 'Experiencia Fitness plan básico-cortesia', 'INACTIVO', '1110453419', '2004-11-04', 20, 'F', NULL, NULL, NULL, NULL, '3232024300', 'sarasofiacardozovera0440@gmail.com', NULL, NULL),
(294, 'Maria Patricia Hernandez', NULL, NULL, 'Experiencia Fitness plan Lujo', 'ACTIVO', '52051837', '1971-12-24', 53, 'F', NULL, NULL, NULL, NULL, '3173837115', 'mpatriciaha@yahoo.com.co', NULL, NULL),
(295, 'Karol Hernandez Cortes', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '36305501', '1982-09-03', 43, 'F', NULL, NULL, NULL, NULL, '3176607400', 'carolhernadez106@hotmail.com', NULL, NULL),
(296, 'Sandra Varón', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '28544850', '1980-11-29', 44, 'F', NULL, NULL, NULL, NULL, '3144723565', 'sandravconcejalibague@gmail.com', NULL, NULL),
(297, 'Natalia Andrea Romero Martínez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1018455672', '1992-11-14', 32, 'M', NULL, NULL, NULL, NULL, '3156060152', 'nataliaromero921114542@gmail.com', NULL, NULL),
(298, 'Maria Cristina Gomez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '41107403', '1973-02-25', 52, 'F', NULL, NULL, NULL, NULL, '3133364319', 'jwogomez@hotmail.com', NULL, NULL),
(299, 'Maria Alejandra Rodriguez Ospina', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110565875', '1995-12-03', 29, 'F', NULL, NULL, NULL, NULL, '3178359743', 'maleja_rod@hotmail.com', NULL, NULL),
(300, 'Yaldrin Valentina Mendoza', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '11045444413', '2004-05-07', 21, 'F', NULL, NULL, NULL, NULL, '3153850798', 'yaldrinmendoza@gmail.com', NULL, NULL),
(301, 'Danna Ospina', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '11014148638', '2011-05-01', 14, 'F', NULL, NULL, NULL, NULL, '3213939508', 'jwogomez@hotmail.com', NULL, NULL),
(302, 'Gloria Gomez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '41145171', '1983-08-08', 41, 'F', NULL, NULL, NULL, NULL, '3133532235', 'jwogomez@hotmail.com', NULL, NULL),
(303, 'Jennifer pinto', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1094266209', '1990-10-16', 34, 'F', NULL, NULL, NULL, NULL, '3206233256', 'jp_mayorga@hotmail.com', NULL, NULL),
(304, 'Alma Esperanza Moscoso', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '51724171', '1963-07-12', 61, 'F', NULL, NULL, NULL, NULL, '3182190008', 'almaesperanza2003@gmail.com', NULL, NULL),
(305, 'Valeria Campos Guzmán', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110586186', '1997-11-14', 27, 'F', NULL, NULL, NULL, NULL, '316 5395304', 'Valecamposg@hotmail.com', NULL, NULL),
(306, 'Jose Guillermo Gonzalez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '93407709', '1977-10-04', 47, 'M', '2025-05-21', NULL, NULL, NULL, '3166884960', 'guillegonzalez.gonzalez@gmail.com', NULL, NULL),
(307, 'Andres Felipe Moreno Rojas', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', 'TI1031819748', '2009-09-26', 15, 'M', NULL, NULL, NULL, NULL, '3133936961', 'diannna.florez@hotmail.com', NULL, NULL),
(308, 'Emilio Gabriel Botero Arbelaez', NULL, NULL, 'Experiencia Fitness plan básico+Personalizado', 'INACTIVO', '1201468942', '2015-01-05', 10, 'M', '2025-05-26', NULL, NULL, NULL, '3208565148', 'ffbotero@gmail.com', NULL, NULL),
(309, 'Nidia Perez', NULL, NULL, 'Experiencia Fitness plan básico+Personalizado', 'INACTIVO', '6569680', '1958-12-01', 66, 'F', '2025-05-27', NULL, NULL, NULL, '3023629699', NULL, NULL, NULL),
(310, 'Juan Carlos Herran Seyes', NULL, NULL, 'Experiencia Fitness plan Lujo', 'INACTIVO', '93393744', '1974-09-06', 50, 'M', NULL, NULL, NULL, NULL, '3182098074', 'jcherrac@gmail.com', NULL, NULL),
(311, 'Fabian Marcel Lozano', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '93236656', '1984-11-10', 40, 'M', '2025-05-30', NULL, NULL, NULL, '3134302190', 'fabianlozanohyh@gmail.com', NULL, NULL),
(312, 'Yenny Lorena Tejada Villanueva', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110494397', '1989-11-24', 35, 'F', NULL, NULL, NULL, NULL, '3123506892', 'jenny.890@hotmail.com', NULL, NULL),
(313, 'Cesar Augusto Cobaleda Luna', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '5829441', '1981-01-14', 44, 'M', NULL, NULL, NULL, NULL, '3118480350', 'cecobaluna@hotmail.com', NULL, NULL),
(314, 'Laura Sofia Villarreal Santos', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1005912225', '2003-09-22', 21, 'F', NULL, NULL, NULL, NULL, '3007591050', 'laura.villarrealsantos@gmail.com', NULL, NULL),
(315, 'Simo Botero Arbelaez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1201446441', '2013-02-11', 12, 'M', NULL, NULL, NULL, NULL, '3208565148', 'danyarlo@hotmail.com', NULL, NULL),
(316, 'Elizabeth Diaz Carvajal', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1105464085', '2006-08-14', 18, 'F', NULL, NULL, NULL, NULL, '3044943841', 'elizabethdiazcarvajal140608@gmail.com', NULL, NULL),
(317, 'Consuelo Cuenca', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '39539484', '1966-07-21', 58, 'F', NULL, NULL, NULL, NULL, '3173643445', 'ana.cuenca2107@gmail.com', NULL, NULL),
(318, 'Mike Leandro Campaz', NULL, NULL, 'terapia Fisica', 'ACTIVO', '1122516181', '2007-08-07', 17, 'M', NULL, NULL, NULL, NULL, '3116313913', 'mikecampaz78@hotmail.com', NULL, NULL),
(319, 'Juan Sebastian Herran Rodríguez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1104947057', '2011-01-02', 14, 'M', NULL, NULL, NULL, NULL, '3182098074', 'jcherrac@gmail.com', NULL, NULL),
(320, 'Joaquin Poveda Wilches', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1014888438', '2015-01-24', 10, 'M', NULL, NULL, NULL, NULL, '3012848370', 'sandrawilches27@gmail.com', NULL, NULL),
(321, 'Juan Diego Espejo', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1070589689', '2005-08-08', 20, 'M', NULL, NULL, NULL, NULL, '3133753529', 'juandivolador@gmail.com', NULL, NULL),
(322, 'Camilo Caina', NULL, NULL, 'Experiencia Fitness plan Lujo', 'ACTIVO', '1197465094', '2011-03-15', 14, 'M', '2025-06-20', NULL, NULL, NULL, '3173319705', 'lelogallego@hotmail.com', NULL, NULL),
(323, 'Carlos David Lobón', NULL, NULL, 'EMBAJADOR', 'INACTIVO', '1110477199', '1988-10-05', 36, 'M', NULL, NULL, NULL, NULL, '3208290160', 'davidlobon88david@gmail.com', NULL, NULL),
(324, 'Olga Lucia Marulanda Rodriguez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '28837392', '1964-08-29', 60, 'F', NULL, NULL, NULL, NULL, '3232300636', 'rosmayra26@gmail.com', NULL, NULL),
(325, 'Claudia Yohana Silva', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65754277', '1972-04-11', 53, 'F', '2025-06-19', NULL, NULL, NULL, '3002082638', 'arqtata@hotmail.com', NULL, NULL),
(326, 'Luz Ines Ramirez Jimenez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1970-10-09', 54, 'F', '2025-06-19', NULL, NULL, NULL, '3163562954', 'luzinesramirez@gmail.com', NULL, NULL),
(327, 'Juliana Díaz Carvajal', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1104548978', '2012-10-04', 13, 'F', '2025-06-20', NULL, NULL, NULL, '3144442447', 'johana.carvajal@controlambiental.com.co', NULL, NULL),
(328, 'Francisco Oviedo Hernandez', NULL, NULL, NULL, 'INACTIVO', '93367821', '1967-01-01', 58, 'M', NULL, NULL, NULL, NULL, '3163815529', 'franciscoviedo01@hotmail.com', NULL, NULL),
(329, 'Delsy Esperanza Isaza', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65808881', '1978-08-05', 46, 'F', NULL, NULL, NULL, NULL, '3107847928', 'delcisaza@yahoo.com', NULL, NULL),
(330, 'Felipe Bocanegra', NULL, NULL, 'Experiencia Fitness plan básico+Personalizado', 'ACTIVO', '1110534351', '1993-03-19', 32, 'M', '2025-07-01', NULL, NULL, NULL, '3213708267', 'lfbocanegra1@gmail.com', NULL, NULL),
(331, 'Isabella Reyes Giraldo', NULL, NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', '1197464881', '2010-12-24', 14, 'F', NULL, NULL, NULL, NULL, '3213250962', 'juan10andres11acosta12@gmail.com', NULL, NULL),
(332, 'Juan David Lopez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1234638027', '1997-05-28', 28, 'M', NULL, NULL, NULL, NULL, '3004080262', 'juandlopez628@gmail.com', NULL, NULL),
(333, 'Saul Fernando Rodriguez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '19261461', '1955-06-24', 70, 'M', '2025-07-09', NULL, NULL, NULL, '3152571942', 'saul.rodriguez@sfr.com.co', NULL, NULL),
(334, 'Sara Fernanda Muñoz Bermudez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1019014482', '2004-09-23', 20, 'F', '2025-05-15', NULL, NULL, NULL, '3227029880', 'sarafernandabermudez@gmail.com', NULL, NULL),
(335, 'Jeimmy Janeth Bermudez Molano', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1019020222', '1986-11-08', 37, 'F', '2025-05-15', NULL, NULL, NULL, '3202882009', 'sarafernandabermudez@gmail.com', NULL, NULL),
(336, 'Gloria Patricia Moreno', NULL, NULL, 'ENVIAR GUIA NUTRICIONAL', 'INACTIVO', '38260988', '1967-04-20', 57, 'F', NULL, NULL, NULL, NULL, '3003129443', 'patymorere@hotmail.com', NULL, NULL),
(337, 'Paola Ayerbe Fierro', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110581624', '1997-04-16', 28, 'F', '2025-07-18', NULL, NULL, NULL, '3182062713', 'paoayer@hotmail.com', NULL, NULL),
(338, 'Juan David Cruz', NULL, NULL, 'terapia Fisica', 'ACTIVO', '1104545118', '2005-03-28', 20, 'M', NULL, NULL, NULL, NULL, '3219483841', 'juancruz200528@gmail.com', NULL, NULL),
(339, 'Diana Cristina Lozano Fuentes', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65756317', '1962-10-01', 52, 'F', '2025-07-22', NULL, NULL, NULL, '3187124566', 'dianacristina1972@hotmail.com', NULL, NULL),
(340, 'Jaime Enesto Baquero barrios', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '93370265', '1967-10-31', 57, 'F', NULL, NULL, NULL, NULL, '3188410097', 'jotabaquero90@hotmail.com', NULL, NULL),
(341, 'Sandra Del pilar Pardo Suarez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '51738153', '1963-06-17', 62, 'F', '2025-07-25', NULL, NULL, NULL, '3102814624', 'aquispps@gmail.com', NULL, NULL),
(342, 'Claudia Julieta Ciro Basto', NULL, NULL, 'Experiencia Fitness plan de fitness', 'ACTIVO', '65755327', '1972-07-29', 53, 'F', '2025-08-01', NULL, NULL, NULL, '3215071208', 'cirobasto.claudiajulieta@gmail.com', NULL, NULL),
(343, 'Nathalia Berrio', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1109384667', '1991-09-24', 33, 'F', '2025-07-08', NULL, NULL, NULL, '3183772765', 'nathaliaandreaberrio@hotmail.com', NULL, NULL),
(344, 'Angie Daniela Motta Sanchez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110585045', '1997-09-17', 27, 'F', '2025-08-05', NULL, NULL, NULL, '3229476627', 'angie_17_1997@hotmail.com', NULL, NULL),
(345, 'Santiago José Salazar Pineda', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1106632788', '2005-05-06', 20, 'M', '2025-08-11', NULL, NULL, NULL, '3003178801', 'salazarsantiago570@gmail.com', NULL, NULL),
(346, 'Leidy Cristina Cardenas Bocanegra', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '39580285', '1982-07-12', 43, 'F', '2025-08-08', NULL, NULL, NULL, '3203064917', 'leidygomela12@gmail.com', NULL, NULL),
(347, 'Camila Suarez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1106226496', '2004-12-24', 20, 'F', '2025-08-13', NULL, NULL, NULL, '3025691955', 'mcsm2425@gmail.com', NULL, NULL),
(348, 'Jair Yovanny Castro Morales', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '93405702', '1977-10-27', 47, 'M', '2025-08-14', NULL, NULL, NULL, '3208381211', 'jacasmo@hotmail.com', NULL, NULL),
(349, 'Santiago Hernandez Valencia', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110569619', '1996-02-22', 29, 'M', '2025-08-20', NULL, NULL, NULL, '3123419411', 'lorenapinto0795@hotmail.com', NULL, NULL),
(350, 'Maria Cecilia Guarnizo Mejía', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', 'TI 1197463244', '2009-03-27', 16, 'F', '2025-08-15', NULL, NULL, NULL, '3144425720', 'guarnizomejiamariacecilia@gmail.com', NULL, NULL),
(351, 'Liby Yalexi Reyes Chilatra', NULL, NULL, 'Terapia física', 'ACTIVO', '1110481679', '1989-02-13', 36, 'F', '2025-08-20', NULL, NULL, NULL, '3158241082', 'liyare.reyes@gmail.com', NULL, NULL),
(352, 'Gabriel Enrique Jauregui', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1100976569', '1995-08-24', 30, 'M', '2025-07-17', NULL, NULL, NULL, '3113679782', 'gabrielpoleo8@gmail.com', NULL, NULL),
(353, 'Luis Eduardo Santos Gonzañez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '93238463', '1982-04-22', 43, 'M', '2025-07-23', NULL, NULL, NULL, '3108036132', 'leidygomela12@gmail.com', NULL, NULL),
(354, 'Isabella Reyes Giraldo', NULL, NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', 'TI 1197464881', '2010-12-24', 14, 'F', '2025-09-17', NULL, NULL, NULL, '316 2925186', 'jessica.giraldo.varon@gmail.com', NULL, NULL),
(355, 'Nubia Consuelo Murillo Cuenca', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65727865', '1965-01-09', 60, 'F', '2025-09-05', NULL, NULL, NULL, '3188055641', 'nuco195@hotmail.com', NULL, NULL),
(356, 'Odilia Del Carmen Delgado de Caina', NULL, NULL, 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', '23270903', '1951-03-02', 74, 'F', '2025-09-02', NULL, NULL, NULL, '3007768531', 'willicaina@hotmail.com', NULL, NULL),
(357, 'Sandra Patricia Wilches Machado', NULL, NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', '65765800', '1975-04-27', 50, 'F', '2025-09-02', NULL, NULL, NULL, '3012848360', 'sandrawilches27@gmail.com', NULL, NULL),
(358, 'Geovanny Alejandro Vargas Chacón', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '6571988', '2002-05-20', 23, 'M', '2025-07-18', NULL, NULL, NULL, '3113420568', 'geoalevch@gmail.com', NULL, NULL),
(359, 'Natalia Godoy Triana', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1127229229', '1987-07-08', 38, 'F', '2025-10-02', NULL, NULL, NULL, '3187997777', 'godoynata@gmail.com', NULL, NULL),
(360, 'Diana Milena Rivera Gomez', NULL, NULL, 'Experiencia Fitness plan lujo + Personalizado', 'ACTIVO', '52845007', '1982-06-10', 43, 'F', '2025-09-12', NULL, NULL, NULL, '3005325570', 'dmriverago@hotmail.com', NULL, NULL),
(361, 'Diana Patricia Ramirez Lozano', NULL, NULL, 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', '1110473191', '1988-05-01', 37, 'F', '2025-09-15', NULL, NULL, NULL, '3168713388', 'iparalo45@hotmail.com', NULL, NULL),
(362, 'Juan Sebastian Izquierdo Monroy', NULL, NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', '1005716330', '2002-03-05', 23, 'M', '2025-09-17', NULL, NULL, NULL, '3203536770', 'juansebastianmonroy773@gmail.com', NULL, NULL),
(363, 'Mariangel Caro Urrego', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', 'TI 1105469691', '2009-06-03', 16, 'F', '2025-09-19', NULL, NULL, NULL, '3054259939', 'mariangelcarourrego@gmail.com', NULL, NULL),
(364, 'Hellen Chiquinquira Rico Pertuz', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110603423', '1991-04-10', 34, 'F', '2025-09-22', NULL, NULL, NULL, '3208610690', 'hellenrincondiaz@gmail.com', NULL, NULL),
(365, 'German Augenio Alvarado Gaitan', NULL, NULL, 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', '14228065', '1959-05-06', 66, 'M', '2025-09-25', NULL, NULL, NULL, '3102820473', 'german.alvarado@notaria2ibague.com', NULL, NULL),
(366, 'Andres Ortíz', NULL, NULL, 'Terapia Física', 'ACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(367, 'Hernan Parra Chacón', NULL, NULL, 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', '5945538', '1952-04-21', 73, 'M', '2025-09-26', NULL, NULL, NULL, '3154666229', 'herpacha@yahoo.com', NULL, NULL),
(368, 'Carmen Cecilia Hernandez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65735913', '1967-08-24', 57, 'F', '2025-09-26', NULL, NULL, NULL, '3182971566', 'ninaherpa@yahoo-com', NULL, NULL),
(369, 'Sergio Murra Buenaventura', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110488330', '1989-09-11', 36, 'M', '2025-10-07', NULL, NULL, NULL, '3164748017', 'sermurra@hotmail.com', NULL, NULL),
(370, 'Laura Sierra Delgado', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1016105648', '1998-09-15', 27, 'F', '2025-10-09', NULL, NULL, NULL, '3212428271', 'laurasd06@gmail.com', NULL, NULL),
(371, 'Adriana Patricia Foronda Mira', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '39355098', '1973-04-17', 52, 'F', '2025-10-09', NULL, NULL, NULL, '3012050185', 'adryforonda0417@gmail.com', NULL, NULL),
(372, 'Nina Patricia Guzman Prada', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65747352', '1970-04-30', 55, 'F', '2025-10-10', NULL, NULL, NULL, '3125646903', 'ninaguzmanp@yahoo.es', NULL, NULL),
(373, 'Juan Carlos Colmenares Peñaloza', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '93380906', '1989-02-10', 55, 'M', '2025-10-10', NULL, NULL, NULL, '3174032783', 'lepton2050@gmail.om', NULL, NULL),
(374, 'Yugreidy Dariana Gonzalez Sanchez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1094169961', '2004-11-15', 20, 'F', '2025-10-16', NULL, NULL, NULL, '3113437048', 'darilis2010@hotmail.com', NULL, NULL),
(375, 'Nayury Ceballos Gaspar', NULL, NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', '38142567', '1980-12-18', 45, 'F', '2025-10-20', NULL, NULL, NULL, '3114616556', 'nayuceballosg18@gmail.com', NULL, NULL),
(376, 'Napoleon Hernandez Palacios', NULL, NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', '14243683', '1963-06-01', 62, 'M', '2025-10-20', NULL, NULL, NULL, '3160888828', 'napoleo.h01@gmail.com', NULL, NULL),
(377, 'Ana Milena Barreto Acevedo', NULL, NULL, 'Experiencia Fitness', 'ACTIVO', '1110533217', '1993-03-13', 32, 'F', '2025-10-21', NULL, NULL, NULL, '3203044761', 'milenabarreto30@gmail.com', NULL, NULL),
(378, 'Isabella Castillo Urbano', NULL, NULL, 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', 'TI 1106228457', '2008-12-29', 16, 'F', '2025-10-21', NULL, NULL, NULL, '3185597911', 'castilloisabella608@gmail.com', NULL, NULL),
(379, 'Valentina Martinez Rojas', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110592605', '1998-08-19', 27, 'F', '2025-10-23', NULL, NULL, NULL, '3203703045', 'valen9808mr@hotmail.com', NULL, NULL),
(380, 'Erika Marcela Constain Valencia', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1053849833', '1996-05-10', 28, 'F', '2025-10-28', NULL, NULL, NULL, '3186189305', 'emcv1234@gmail.com', NULL, NULL),
(381, 'Manuel Jose Rodriguez Cardozo', NULL, NULL, 'Experiencia Fitness plan básico+Personalizado', 'ACTIVO', '14240515', '1962-06-23', 63, 'M', '2025-11-04', NULL, NULL, NULL, '3183583132', 'yanedmarirodriguezp@gmail.com', NULL, NULL),
(382, 'Oscar Javier Nuñez Diaz', NULL, NULL, 'Experiencia Fitness de Lujo + personalizado', 'ACTIVO', '5821939', '1980-06-07', 45, 'M', '2025-11-05', NULL, NULL, NULL, '3246815574', 'oscarjavier170@hotmail.com', NULL, NULL),
(383, 'Angela Milena Saavedra Avila', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '37995083', '1985-04-05', 40, 'F', '2025-11-04', NULL, NULL, NULL, '3232086663', 'angimi1205@gmail.com', NULL, NULL),
(384, 'Alan Mauricio Rondon', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', 'TI 1197463881', '2009-11-14', 16, 'M', '2025-11-14', NULL, NULL, NULL, '3232169403', 'bibi290580@gmail.com', NULL, NULL),
(409, 'Larry Garcia', '2025-12-15', '2026-01-20', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'CONGELADO', '11025874', '2001-05-31', 25, 'M', '2025-12-19', '2025-12-17', '2025-12-09', 'rovira tolima', '573173328716', 'garcialarry575@gmail.com', '2025-12-21', '2025-12-16');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `WeeklySchedules`
--

CREATE TABLE `WeeklySchedules` (
  `id` int(11) NOT NULL,
  `staff_id` int(11) NOT NULL,
  `day_of_week` int(11) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `max_capacity` int(11) DEFAULT '5'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Volcado de datos para la tabla `WeeklySchedules`
--

INSERT INTO `WeeklySchedules` (`id`, `staff_id`, `day_of_week`, `start_time`, `end_time`, `max_capacity`) VALUES
(1, 3, 1, '05:00:00', '10:00:00', 5),
(2, 3, 1, '15:00:00', '19:00:00', 5),
(3, 3, 2, '05:00:00', '10:00:00', 5),
(4, 3, 2, '15:00:00', '19:00:00', 5),
(5, 3, 3, '05:00:00', '10:00:00', 5),
(6, 3, 3, '15:00:00', '19:00:00', 5),
(7, 3, 4, '05:00:00', '10:00:00', 5),
(8, 3, 4, '15:00:00', '19:00:00', 5),
(9, 3, 5, '05:00:00', '10:00:00', 5),
(10, 3, 6, '07:00:00', '11:00:00', 5),
(11, 4, 1, '05:00:00', '12:00:00', 5),
(12, 4, 2, '05:00:00', '12:00:00', 5),
(13, 4, 3, '05:00:00', '12:00:00', 5),
(14, 4, 4, '05:00:00', '12:00:00', 5),
(15, 4, 5, '05:00:00', '12:00:00', 5),
(16, 4, 6, '07:00:00', '11:00:00', 5),
(17, 5, 1, '05:00:00', '10:00:00', 5),
(18, 5, 2, '05:00:00', '10:00:00', 5),
(19, 5, 3, '05:00:00', '10:00:00', 5),
(20, 5, 4, '05:00:00', '10:00:00', 5),
(21, 5, 5, '05:00:00', '10:00:00', 5),
(22, 5, 5, '15:00:00', '17:00:00', 5),
(23, 6, 1, '05:00:00', '09:00:00', 5),
(24, 6, 1, '16:00:00', '20:00:00', 5),
(25, 6, 3, '05:00:00', '09:00:00', 5),
(26, 6, 3, '16:00:00', '20:00:00', 5),
(27, 6, 5, '05:00:00', '09:00:00', 5),
(28, 6, 5, '16:00:00', '20:00:00', 5),
(29, 6, 2, '05:00:00', '10:00:00', 5),
(30, 6, 2, '17:00:00', '20:00:00', 5),
(31, 6, 4, '05:00:00', '10:00:00', 5),
(32, 6, 4, '17:00:00', '20:00:00', 5),
(33, 6, 6, '07:00:00', '11:00:00', 5),
(34, 7, 1, '07:00:00', '11:00:00', 5),
(35, 7, 1, '15:00:00', '19:00:00', 5),
(36, 7, 2, '07:00:00', '11:00:00', 5),
(37, 7, 2, '15:00:00', '19:00:00', 5),
(38, 7, 3, '07:00:00', '11:00:00', 5),
(39, 7, 3, '15:00:00', '19:00:00', 5),
(40, 7, 4, '07:00:00', '11:00:00', 5),
(41, 7, 4, '15:00:00', '19:00:00', 5),
(42, 7, 5, '07:00:00', '11:00:00', 5),
(43, 7, 5, '15:00:00', '19:00:00', 5),
(44, 7, 6, '07:00:00', '11:00:00', 5),
(45, 8, 1, '07:00:00', '11:00:00', 1),
(46, 9, 1, '07:00:00', '11:00:00', 1),
(47, 10, 1, '07:00:00', '11:00:00', 1),
(48, 8, 1, '15:00:00', '19:00:00', 1),
(49, 9, 1, '15:00:00', '19:00:00', 1),
(50, 10, 1, '15:00:00', '19:00:00', 1),
(51, 8, 2, '07:00:00', '11:00:00', 1),
(52, 9, 2, '07:00:00', '11:00:00', 1),
(53, 10, 2, '07:00:00', '11:00:00', 1),
(54, 8, 2, '15:00:00', '19:00:00', 1),
(55, 9, 2, '15:00:00', '19:00:00', 1),
(56, 10, 2, '15:00:00', '19:00:00', 1),
(57, 8, 3, '07:00:00', '11:00:00', 1),
(58, 9, 3, '07:00:00', '11:00:00', 1),
(59, 10, 3, '07:00:00', '11:00:00', 1),
(60, 8, 3, '15:00:00', '19:00:00', 1),
(61, 9, 3, '15:00:00', '19:00:00', 1),
(62, 10, 3, '15:00:00', '19:00:00', 1),
(63, 8, 4, '07:00:00', '11:00:00', 1),
(64, 9, 4, '07:00:00', '11:00:00', 1),
(65, 10, 4, '07:00:00', '11:00:00', 1),
(66, 8, 4, '15:00:00', '19:00:00', 1),
(67, 9, 4, '15:00:00', '19:00:00', 1),
(68, 10, 4, '15:00:00', '19:00:00', 1),
(69, 8, 5, '07:00:00', '11:00:00', 1),
(70, 9, 5, '07:00:00', '11:00:00', 1),
(71, 10, 5, '07:00:00', '11:00:00', 1),
(72, 8, 5, '15:00:00', '19:00:00', 1),
(73, 9, 5, '15:00:00', '19:00:00', 1),
(74, 10, 5, '15:00:00', '19:00:00', 1),
(75, 8, 6, '07:00:00', '11:00:00', 1),
(76, 9, 6, '07:00:00', '11:00:00', 1),
(77, 10, 6, '07:00:00', '11:00:00', 1);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `admins`
--
ALTER TABLE `admins`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indices de la tabla `Appointments`
--
ALTER TABLE `Appointments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_user_booking` (`user_id`,`appointment_date`,`start_time`),
  ADD KEY `fk_appt_users` (`user_id`),
  ADD KEY `fk_appt_staff` (`staff_id`);

--
-- Indices de la tabla `Staff`
--
ALTER TABLE `Staff`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `Users`
--
ALTER TABLE `Users`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `WeeklySchedules`
--
ALTER TABLE `WeeklySchedules`
  ADD PRIMARY KEY (`id`),
  ADD KEY `staff_id` (`staff_id`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `admins`
--
ALTER TABLE `admins`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT de la tabla `Appointments`
--
ALTER TABLE `Appointments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=63;

--
-- AUTO_INCREMENT de la tabla `Staff`
--
ALTER TABLE `Staff`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT de la tabla `Users`
--
ALTER TABLE `Users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=410;

--
-- AUTO_INCREMENT de la tabla `WeeklySchedules`
--
ALTER TABLE `WeeklySchedules`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=108;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `Appointments`
--
ALTER TABLE `Appointments`
  ADD CONSTRAINT `fk_appt_staff` FOREIGN KEY (`staff_id`) REFERENCES `Staff` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_appt_users` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `WeeklySchedules`
--
ALTER TABLE `WeeklySchedules`
  ADD CONSTRAINT `WeeklySchedules_ibfk_1` FOREIGN KEY (`staff_id`) REFERENCES `Staff` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
