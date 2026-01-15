-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: mysql:3306
-- Tiempo de generación: 15-01-2026 a las 02:18:03
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
CREATE DEFINER=`cardiofit_user`@`%` PROCEDURE `AgendarAutomatico` (IN `p_user_id` INT, IN `p_date` DATE, IN `p_time` TIME, IN `p_role` VARCHAR(50))   BEGIN
    -- Declaración de variables
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_staff_id INT;
    DECLARE v_capacity INT;
    DECLARE v_current_bookings INT;
    DECLARE v_day_of_week INT;
    DECLARE v_assigned_staff VARCHAR(100);
    DECLARE v_is_open INT DEFAULT 0;

    -- 1. CALCULAR DÍA DE LA SEMANA (1=Lunes ... 7=Domingo)
    SET v_day_of_week = WEEKDAY(p_date) + 1; 

    -- ==============================================================================
    -- VALIDACIONES (EL PORTERO)
    -- ==============================================================================

    -- CASO A: Es Domingo
    IF v_day_of_week = 7 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Lo sentimos, no laboramos los Domingos. Por favor elige otro día.';
    END IF;

    -- CASO B: ¿Hay personal de ese ROL trabajando a esa hora?
    SELECT COUNT(*) INTO v_is_open
    FROM WeeklySchedules ws
    JOIN Staff s ON ws.staff_id = s.id
    WHERE ws.day_of_week = v_day_of_week
      AND CAST(p_time AS TIME) >= CAST(ws.start_time AS TIME) 
      AND CAST(p_time AS TIME) < CAST(ws.end_time AS TIME)
      AND s.is_active = 1
      AND s.role = p_role; -- FILTRO IMPORTANTE: Solo cuenta si coincide el rol

    -- Si no hay especialistas de ese tipo trabajando
    IF v_is_open = 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'No hay especialistas de este tipo disponibles en este horario o el centro está cerrado.';
    END IF;

    -- ==============================================================================
    -- LÓGICA DE AGENDAMIENTO
    -- ==============================================================================

    BEGIN
        -- El cursor ahora busca staff ordenado por prioridad PERO filtrado por el rol
        DECLARE cur CURSOR FOR 
            SELECT s.id, ws.max_capacity, s.name
            FROM Staff s
            JOIN WeeklySchedules ws ON s.id = ws.staff_id
            WHERE ws.day_of_week = v_day_of_week
              AND CAST(p_time AS TIME) >= CAST(ws.start_time AS TIME) 
              AND CAST(p_time AS TIME) < CAST(ws.end_time AS TIME)
              AND s.is_active = 1
              AND s.role = p_role -- FILTRO: Solo trae staff del rol solicitado
            ORDER BY s.priority_order ASC;
            
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

        OPEN cur;

        read_loop: LOOP
            FETCH cur INTO v_staff_id, v_capacity, v_assigned_staff;
            IF done THEN
                LEAVE read_loop;
            END IF;

            -- Contar ocupación actual de ese especialista específico
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
                
                SELECT CONCAT('Reserva confirmada con ', v_assigned_staff, ' (', p_role, ')') as Mensaje;
                SET done = TRUE; 
                LEAVE read_loop;
            END IF;
        END LOOP;

        CLOSE cur;
    END;
    
    -- Si llegamos al final y 'done' sigue siendo FALSE o no se insertó nada
    IF (SELECT ROW_COUNT() = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lo sentimos, todos los especialistas de esa área están ocupados a esa hora.';
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
(4, 'Larry Garcia M', 'garcialaarry575@gmail.com', 'Laxky0338c'),
(5, 'Maria Fernanda Sanchez', 'cardiofitlab.admon@gmail.com', 'Fit1212***');

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
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_locking` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Volcado de datos para la tabla `Appointments`
--

INSERT INTO `Appointments` (`id`, `user_id`, `staff_id`, `appointment_date`, `start_time`, `end_time`, `status`, `created_at`, `is_locking`) VALUES
(54, 2, 3, '2026-01-05', '14:00:00', '15:00:00', 'confirmed', '2026-01-03 19:15:16', 0),
(55, 2, 3, '2026-01-05', '15:00:00', '16:14:32', 'confirmed', '2026-01-03 19:15:16', 0),
(84, 2, 3, '2026-01-05', '16:00:00', '17:14:32', 'confirmed', '2026-01-03 19:15:16', 0),
(85, 101, 8, '2026-01-05', '15:00:00', '16:00:00', 'confirmed', '2026-01-03 20:35:20', 0),
(86, 102, 9, '2026-01-05', '15:00:00', '16:00:00', 'confirmed', '2026-01-03 20:35:20', 0),
(87, 157, 4, '2026-01-13', '05:00:00', '06:00:00', 'cancelled', '2026-01-09 23:03:22', 0),
(88, 157, 4, '2026-01-14', '05:00:00', '06:00:00', 'cancelled', '2026-01-09 23:03:34', 0),
(89, 157, 4, '2026-01-15', '05:00:00', '06:00:00', 'cancelled', '2026-01-09 23:03:50', 0),
(90, 372, 6, '2026-01-13', '05:00:00', '06:00:00', 'confirmed', '2026-01-09 23:06:00', 0),
(93, 199, 6, '2026-01-13', '05:00:00', '06:00:00', 'confirmed', '2026-01-09 23:07:40', 0),
(96, 305, 6, '2026-01-13', '05:00:00', '06:00:00', 'confirmed', '2026-01-09 23:10:15', 0),
(97, 373, 4, '2026-01-13', '05:00:00', '06:00:00', 'confirmed', '2026-01-09 23:10:44', 0),
(98, 227, 4, '2026-01-13', '05:00:00', '06:00:00', 'confirmed', '2026-01-09 23:11:07', 0),
(99, 420, 4, '2026-01-13', '05:00:00', '06:00:00', 'confirmed', '2026-01-09 23:12:50', 0),
(100, 365, 5, '2026-01-13', '05:00:00', '06:00:00', 'confirmed', '2026-01-09 23:13:16', 0),
(101, 239, 6, '2026-01-13', '05:00:00', '06:00:00', 'confirmed', '2026-01-09 23:14:04', 0),
(102, 225, 3, '2026-01-13', '05:00:00', '06:00:00', 'confirmed', '2026-01-09 23:15:07', 0),
(103, 370, 4, '2026-01-13', '06:00:00', '07:00:00', 'confirmed', '2026-01-09 23:39:33', 0),
(104, 421, 6, '2026-01-13', '06:00:00', '07:00:00', 'confirmed', '2026-01-09 23:44:37', 0),
(105, 136, 5, '2026-01-13', '06:00:00', '07:00:00', 'confirmed', '2026-01-09 23:48:12', 0),
(106, 369, 5, '2026-01-13', '06:00:00', '07:00:00', 'confirmed', '2026-01-09 23:48:37', 0),
(107, 380, 5, '2026-01-13', '06:00:00', '07:00:00', 'confirmed', '2026-01-09 23:51:23', 0),
(108, 153, 3, '2026-01-13', '06:00:00', '07:00:00', 'confirmed', '2026-01-09 23:52:47', 0),
(109, 139, 3, '2026-01-13', '06:00:00', '07:00:00', 'confirmed', '2026-01-09 23:53:11', 0),
(157, 422, 4, '2026-01-12', '10:00:00', '11:00:00', 'confirmed', '2026-01-12 13:24:33', 0),
(162, 372, 4, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 13:20:57', 0),
(163, 183, 4, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 13:21:08', 0),
(164, 373, 5, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 13:21:26', 0),
(165, 227, 5, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 13:21:35', 0),
(166, 420, 5, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 13:21:42', 0),
(167, 199, 3, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 13:21:57', 0),
(168, 141, 3, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 13:22:13', 0),
(169, 239, 3, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 13:22:26', 0),
(170, 305, 3, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 13:22:36', 0),
(171, 369, 4, '2026-01-14', '06:00:00', '07:00:00', 'confirmed', '2026-01-13 13:23:01', 0),
(172, 325, 4, '2026-01-14', '06:00:00', '07:00:00', 'confirmed', '2026-01-13 13:26:08', 0),
(173, 153, 6, '2026-01-14', '06:00:00', '07:00:00', 'confirmed', '2026-01-13 13:26:46', 0),
(174, 139, 6, '2026-01-14', '06:00:00', '07:00:00', 'confirmed', '2026-01-13 13:26:53', 0),
(175, 370, 3, '2026-01-14', '06:00:00', '07:00:00', 'confirmed', '2026-01-13 13:27:11', 0),
(176, 380, 3, '2026-01-14', '06:00:00', '07:00:00', 'confirmed', '2026-01-13 13:27:22', 0),
(177, 423, 6, '2026-01-14', '06:00:00', '07:00:00', 'confirmed', '2026-01-13 17:56:38', 0),
(178, 244, 4, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 17:57:07', 0),
(179, 169, 4, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 17:57:16', 0),
(180, 168, 4, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 17:57:25', 0),
(183, 27, 4, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 17:58:01', 0),
(184, 25, 6, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 17:58:17', 0),
(185, 18, 5, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 17:58:35', 0),
(186, 74, 5, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 17:58:42', 0),
(188, 377, 3, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 17:59:14', 0),
(189, 255, 3, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 17:59:23', 0),
(190, 431, 7, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 17:59:38', 0),
(193, 431, 7, '2026-01-13', '06:00:00', '07:00:00', 'confirmed', '2026-01-13 18:00:49', 0),
(198, 25, 6, '2026-01-13', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 18:02:43', 0),
(199, 334, 4, '2026-01-14', '08:00:00', '09:00:00', 'confirmed', '2026-01-13 18:03:59', 0),
(200, 335, 4, '2026-01-14', '08:00:00', '09:00:00', 'confirmed', '2026-01-13 18:04:06', 0),
(201, 219, 4, '2026-01-14', '08:00:00', '09:00:00', 'confirmed', '2026-01-13 18:04:15', 0),
(202, 424, 4, '2026-01-14', '09:00:00', '10:00:00', 'confirmed', '2026-01-13 18:04:28', 0),
(203, 362, 4, '2026-01-14', '10:00:00', '11:00:00', 'confirmed', '2026-01-13 18:04:40', 0),
(204, 198, 4, '2026-01-14', '11:00:00', '12:00:00', 'confirmed', '2026-01-13 18:04:55', 0),
(205, 187, 4, '2026-01-14', '11:00:00', '12:00:00', 'confirmed', '2026-01-13 18:05:05', 0),
(206, 221, 4, '2026-01-14', '11:00:00', '12:00:00', 'confirmed', '2026-01-13 18:05:13', 0),
(207, 156, 4, '2026-01-14', '11:00:00', '12:00:00', 'confirmed', '2026-01-13 18:05:23', 0),
(208, 5, 6, '2026-01-14', '08:00:00', '09:00:00', 'confirmed', '2026-01-13 18:06:06', 0),
(209, 333, 6, '2026-01-14', '09:00:00', '10:00:00', 'confirmed', '2026-01-13 18:06:17', 0),
(210, 359, 5, '2026-01-14', '09:00:00', '10:00:00', 'confirmed', '2026-01-13 18:06:36', 0),
(212, 49, 5, '2026-01-14', '09:00:00', '10:00:00', 'confirmed', '2026-01-13 18:06:54', 0),
(213, 7, 3, '2026-01-14', '08:00:00', '09:00:00', 'confirmed', '2026-01-13 18:07:19', 0),
(216, 434, 3, '2026-01-14', '09:00:00', '10:00:00', 'confirmed', '2026-01-13 18:07:49', 0),
(217, 383, 7, '2026-01-14', '08:00:00', '09:00:00', 'confirmed', '2026-01-13 18:08:18', 0),
(221, 304, 7, '2026-01-14', '10:00:00', '11:00:00', 'confirmed', '2026-01-13 18:09:27', 0),
(222, 434, 9, '2026-01-14', '08:00:00', '09:00:00', 'confirmed', '2026-01-13 18:09:54', 0),
(224, 369, 9, '2026-01-14', '16:00:00', '17:00:00', 'confirmed', '2026-01-13 18:10:44', 0),
(225, 370, 9, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-13 18:10:56', 0),
(226, 432, 9, '2026-01-14', '18:00:00', '19:00:00', 'confirmed', '2026-01-13 19:54:22', 0),
(228, 161, 4, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 20:16:35', 0),
(229, 165, 7, '2026-01-14', '15:00:00', '16:00:00', 'confirmed', '2026-01-13 20:40:49', 0),
(230, 166, 7, '2026-01-14', '15:00:00', '16:00:00', 'confirmed', '2026-01-13 20:41:00', 0),
(231, 299, 3, '2026-01-14', '15:00:00', '16:00:00', 'confirmed', '2026-01-13 20:41:22', 0),
(232, 360, 3, '2026-01-14', '16:00:00', '17:00:00', 'confirmed', '2026-01-13 20:41:37', 0),
(233, 184, 4, '2026-01-14', '06:00:00', '07:00:00', 'confirmed', '2026-01-13 20:47:32', 0),
(234, 435, 6, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 21:55:00', 0),
(235, 267, 7, '2026-01-14', '16:00:00', '17:00:00', 'confirmed', '2026-01-13 21:55:33', 0),
(236, 436, 7, '2026-01-14', '16:00:00', '17:00:00', 'confirmed', '2026-01-13 21:55:44', 0),
(238, 339, 3, '2026-01-14', '07:00:00', '08:00:00', 'confirmed', '2026-01-13 22:22:55', 0),
(239, 154, 6, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 22:23:20', 0),
(243, 50, 8, '2026-01-14', '09:00:00', '10:00:00', 'confirmed', '2026-01-13 22:28:08', 0),
(244, 340, 3, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-13 22:34:14', 0),
(245, 346, 6, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-13 22:34:32', 0),
(246, 353, 6, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-13 22:34:40', 0),
(247, 330, 7, '2026-01-14', '18:00:00', '19:00:00', 'confirmed', '2026-01-13 22:35:27', 0),
(248, 37, 6, '2026-01-14', '18:00:00', '19:00:00', 'confirmed', '2026-01-13 22:36:08', 0),
(249, 277, 6, '2026-01-14', '18:00:00', '19:00:00', 'confirmed', '2026-01-13 22:36:20', 0),
(251, 252, 6, '2026-01-14', '19:00:00', '20:00:00', 'confirmed', '2026-01-13 22:36:40', 0),
(252, 432, 6, '2026-01-14', '19:00:00', '20:00:00', 'confirmed', '2026-01-13 22:37:15', 0),
(254, 197, 5, '2026-01-14', '09:00:00', '10:00:00', 'confirmed', '2026-01-13 22:40:11', 0),
(256, 437, 6, '2026-01-14', '18:00:00', '19:00:00', 'confirmed', '2026-01-13 22:45:29', 0),
(261, 91, 7, '2026-01-14', '08:00:00', '09:00:00', 'confirmed', '2026-01-13 23:01:54', 0),
(262, 177, 6, '2026-01-14', '05:00:00', '06:00:00', 'confirmed', '2026-01-13 23:02:21', 0),
(264, 354, 7, '2026-01-14', '16:00:00', '17:00:00', 'confirmed', '2026-01-13 23:59:57', 0),
(265, 175, 3, '2026-01-14', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 00:11:09', 0),
(266, 250, 4, '2026-01-14', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 00:11:19', 0),
(267, 427, 4, '2026-01-14', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 12:18:12', 0),
(268, 430, 4, '2026-01-14', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 12:18:37', 0),
(269, 238, 3, '2026-01-14', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 12:36:04', 0),
(270, 429, 3, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 12:46:56', 0),
(271, 438, 7, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 12:47:07', 0),
(272, 352, 7, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 12:47:18', 0),
(273, 37, 8, '2026-01-15', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 12:55:23', 0),
(274, 344, 4, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 12:56:10', 0),
(275, 161, 4, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 12:56:18', 0),
(278, 372, 4, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 12:56:44', 0),
(279, 183, 4, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 12:56:52', 0),
(280, 369, 4, '2026-01-15', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 12:57:04', 0),
(281, 325, 4, '2026-01-15', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 12:57:12', 0),
(282, 244, 4, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 12:57:34', 0),
(283, 168, 4, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 12:57:41', 0),
(284, 169, 4, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 12:57:46', 0),
(285, 27, 4, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 12:57:52', 0),
(286, 334, 4, '2026-01-15', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 12:58:03', 0),
(287, 219, 4, '2026-01-15', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 12:58:11', 0),
(288, 335, 4, '2026-01-15', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 12:58:16', 0),
(290, 428, 4, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 13:00:48', 0),
(291, 362, 4, '2026-01-15', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 13:01:30', 0),
(292, 187, 4, '2026-01-15', '11:00:00', '12:00:00', 'confirmed', '2026-01-14 13:01:42', 0),
(293, 221, 4, '2026-01-15', '11:00:00', '12:00:00', 'confirmed', '2026-01-14 13:01:49', 0),
(294, 198, 4, '2026-01-15', '11:00:00', '12:00:00', 'confirmed', '2026-01-14 13:01:57', 0),
(295, 440, 6, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 13:07:14', 0),
(296, 441, 6, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 13:07:27', 0),
(297, 423, 6, '2026-01-15', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 13:07:47', 0),
(298, 153, 6, '2026-01-15', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 13:07:55', 0),
(299, 139, 6, '2026-01-15', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 13:08:01', 0),
(300, 333, 6, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 13:08:13', 0),
(301, 5, 6, '2026-01-15', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 13:08:20', 0),
(302, 375, 6, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 13:08:35', 0),
(303, 373, 5, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 13:08:48', 0),
(304, 227, 5, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 13:08:54', 0),
(305, 420, 5, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 13:09:00', 0),
(306, 421, 5, '2026-01-15', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 13:09:09', 0),
(307, 18, 5, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 13:09:18', 0),
(308, 74, 5, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 13:09:24', 0),
(309, 359, 5, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 13:09:51', 0),
(311, 430, 5, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 13:10:09', 0),
(312, 427, 5, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 13:10:16', 0),
(313, 199, 3, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 13:10:29', 0),
(314, 141, 3, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 13:10:35', 0),
(315, 239, 3, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 13:10:41', 0),
(316, 305, 3, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 13:10:53', 0),
(317, 370, 3, '2026-01-15', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 13:11:04', 0),
(318, 380, 3, '2026-01-15', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 13:11:10', 0),
(319, 154, 3, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 13:11:21', 0),
(320, 377, 3, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 13:11:31', 0),
(321, 255, 3, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 13:11:45', 0),
(322, 7, 3, '2026-01-15', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 13:12:12', 0),
(323, 424, 3, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 13:12:22', 0),
(324, 431, 7, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 13:12:56', 0),
(325, 383, 7, '2026-01-15', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 13:13:11', 0),
(326, 438, 7, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 13:13:19', 0),
(327, 352, 7, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 13:13:30', 0),
(328, 304, 7, '2026-01-15', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 13:13:39', 0),
(329, 442, 3, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 13:31:00', 0),
(330, 443, 4, '2026-01-14', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 13:33:57', 0),
(331, 443, 4, '2026-01-15', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 13:34:11', 0),
(332, 322, 3, '2026-01-14', '15:00:00', '16:00:00', 'confirmed', '2026-01-14 13:47:04', 0),
(333, 445, 5, '2026-01-14', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 14:13:57', 0),
(334, 435, 6, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 14:16:51', 0),
(335, 428, 3, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 14:24:22', 0),
(336, 434, 7, '2026-01-15', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 14:57:55', 0),
(337, 339, 3, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 14:58:39', 0),
(338, 50, 4, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 15:28:04', 0),
(339, 161, 4, '2026-01-16', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 15:34:06', 0),
(340, 372, 4, '2026-01-16', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 15:34:17', 0),
(341, 183, 4, '2026-01-16', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 15:34:24', 0),
(342, 50, 4, '2026-01-16', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 15:34:42', 0),
(343, 369, 4, '2026-01-16', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 15:34:48', 0),
(344, 325, 4, '2026-01-16', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 15:34:57', 0),
(345, 244, 4, '2026-01-16', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 15:35:18', 0),
(346, 27, 4, '2026-01-16', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 15:35:33', 0),
(347, 168, 4, '2026-01-16', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 15:35:40', 0),
(348, 334, 4, '2026-01-16', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 15:35:54', 0),
(349, 335, 4, '2026-01-16', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 15:36:02', 0),
(350, 219, 4, '2026-01-16', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 15:36:10', 0),
(351, 424, 4, '2026-01-16', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 15:36:20', 0),
(352, 156, 4, '2026-01-16', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 15:36:30', 0),
(353, 362, 4, '2026-01-16', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 15:36:38', 0),
(354, 443, 4, '2026-01-16', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 15:36:45', 0),
(355, 187, 4, '2026-01-16', '11:00:00', '12:00:00', 'confirmed', '2026-01-14 15:36:56', 0),
(356, 221, 4, '2026-01-16', '11:00:00', '12:00:00', 'confirmed', '2026-01-14 15:37:04', 0),
(357, 373, 6, '2026-01-16', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 15:37:30', 0),
(358, 227, 6, '2026-01-16', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 15:37:37', 0),
(359, 420, 6, '2026-01-16', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 15:37:42', 0),
(360, 423, 6, '2026-01-16', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 15:37:59', 0),
(361, 153, 6, '2026-01-16', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 15:38:11', 0),
(362, 139, 6, '2026-01-16', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 15:38:16', 0),
(363, 344, 6, '2026-01-16', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 15:38:24', 0),
(364, 333, 6, '2026-01-16', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 15:38:33', 0),
(365, 5, 6, '2026-01-16', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 15:38:42', 0),
(366, 375, 6, '2026-01-16', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 15:38:49', 0),
(367, 199, 5, '2026-01-16', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 15:39:00', 0),
(368, 141, 5, '2026-01-16', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 15:39:06', 0),
(369, 239, 5, '2026-01-16', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 15:39:17', 0),
(370, 305, 5, '2026-01-16', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 15:39:23', 0),
(371, 421, 5, '2026-01-16', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 15:39:33', 0),
(372, 18, 5, '2026-01-16', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 15:39:43', 0),
(373, 74, 5, '2026-01-16', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 15:39:49', 0),
(374, 377, 5, '2026-01-16', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 15:40:02', 0),
(375, 370, 3, '2026-01-16', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 15:40:53', 0),
(376, 380, 3, '2026-01-16', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 15:41:00', 0),
(377, 377, 3, '2026-01-16', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 15:41:16', 0),
(378, 169, 3, '2026-01-16', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 15:41:33', 0),
(379, 339, 3, '2026-01-16', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 15:41:45', 0),
(380, 7, 3, '2026-01-16', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 15:41:54', 0),
(381, 49, 3, '2026-01-16', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 15:42:09', 0),
(382, 359, 3, '2026-01-16', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 15:42:16', 0),
(383, 430, 3, '2026-01-16', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 15:42:28', 0),
(384, 427, 3, '2026-01-16', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 15:42:34', 0),
(385, 431, 7, '2026-01-16', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 15:42:47', 0),
(386, 383, 7, '2026-01-16', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 15:43:00', 0),
(387, 70, 7, '2026-01-16', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 15:43:13', 0),
(388, 428, 7, '2026-01-16', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 15:43:21', 0),
(389, 304, 7, '2026-01-16', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 15:43:29', 0),
(390, 165, 7, '2026-01-16', '15:00:00', '16:00:00', 'confirmed', '2026-01-14 15:43:42', 0),
(391, 166, 7, '2026-01-16', '15:00:00', '16:00:00', 'confirmed', '2026-01-14 15:43:49', 0),
(392, 360, 7, '2026-01-16', '16:00:00', '17:00:00', 'confirmed', '2026-01-14 15:44:07', 0),
(393, 330, 7, '2026-01-16', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 15:44:16', 0),
(394, 238, 5, '2026-01-16', '16:00:00', '17:00:00', 'confirmed', '2026-01-14 15:44:34', 0),
(395, 376, 5, '2026-01-16', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 15:44:41', 0),
(396, 249, 6, '2026-01-16', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 15:44:58', 0),
(397, 437, 6, '2026-01-16', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 15:45:14', 0),
(398, 37, 6, '2026-01-16', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 15:45:28', 0),
(400, 177, 6, '2026-01-16', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 15:45:44', 0),
(401, 277, 6, '2026-01-16', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 15:45:50', 0),
(402, 217, 6, '2026-01-16', '19:00:00', '20:00:00', 'confirmed', '2026-01-14 15:46:09', 0),
(403, 201, 6, '2026-01-16', '19:00:00', '20:00:00', 'confirmed', '2026-01-14 15:46:17', 0),
(404, 423, 6, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 20:08:17', 0),
(405, 228, 3, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 20:08:25', 0),
(407, 184, 4, '2026-01-15', '06:00:00', '07:00:00', 'confirmed', '2026-01-14 20:11:00', 0),
(408, 446, 7, '2026-01-14', '16:00:00', '17:00:00', 'confirmed', '2026-01-14 20:39:53', 0),
(409, 447, 6, '2026-01-15', '19:00:00', '20:00:00', 'confirmed', '2026-01-14 20:52:29', 0),
(410, 447, 9, '2026-01-19', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 20:52:58', 0),
(411, 165, 3, '2026-01-15', '15:00:00', '16:00:00', 'confirmed', '2026-01-14 21:31:17', 0),
(412, 166, 3, '2026-01-15', '15:00:00', '16:00:00', 'confirmed', '2026-01-14 21:31:25', 0),
(413, 360, 3, '2026-01-15', '16:00:00', '17:00:00', 'confirmed', '2026-01-14 21:32:27', 0),
(414, 376, 3, '2026-01-15', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 21:32:38', 0),
(415, 238, 3, '2026-01-15', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 21:32:57', 0),
(416, 249, 7, '2026-01-15', '15:00:00', '16:00:00', 'confirmed', '2026-01-14 21:36:33', 0),
(417, 330, 7, '2026-01-15', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 21:36:58', 0),
(418, 340, 6, '2026-01-15', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 21:37:18', 0),
(419, 437, 6, '2026-01-15', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 21:37:37', 0),
(421, 37, 6, '2026-01-15', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 21:38:04', 0),
(422, 277, 6, '2026-01-15', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 21:38:24', 0),
(423, 217, 6, '2026-01-15', '19:00:00', '20:00:00', 'confirmed', '2026-01-14 21:39:36', 0),
(424, 177, 6, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 21:39:56', 0),
(425, 420, 9, '2026-01-15', '07:00:00', '08:00:00', 'confirmed', '2026-01-14 21:40:58', 0),
(426, 445, 8, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 21:41:25', 0),
(427, 444, 8, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 21:41:34', 0),
(428, 156, 4, '2026-01-15', '11:00:00', '12:00:00', 'confirmed', '2026-01-14 21:42:24', 0),
(429, 439, 6, '2026-01-14', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 21:52:09', 0),
(430, 446, 7, '2026-01-15', '08:00:00', '09:00:00', 'confirmed', '2026-01-14 21:57:13', 0),
(431, 331, 4, '2026-01-15', '10:00:00', '11:00:00', 'confirmed', '2026-01-14 21:58:10', 0),
(432, 226, 7, '2026-01-15', '16:00:00', '17:00:00', 'confirmed', '2026-01-14 21:58:49', 0),
(433, 436, 7, '2026-01-15', '16:00:00', '17:00:00', 'confirmed', '2026-01-14 21:58:56', 0),
(434, 423, 9, '2026-01-21', '18:00:00', '19:00:00', 'confirmed', '2026-01-14 23:00:30', 0),
(435, 423, 6, '2026-01-21', '19:00:00', '20:00:00', 'confirmed', '2026-01-14 23:00:46', 0),
(436, 230, 4, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 23:04:20', 0),
(437, 439, 5, '2026-01-15', '09:00:00', '10:00:00', 'confirmed', '2026-01-14 23:04:27', 0),
(438, 346, 7, '2026-01-15', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 23:25:57', 0),
(439, 353, 7, '2026-01-15', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 23:26:07', 0),
(440, 139, 8, '2026-01-15', '17:00:00', '18:00:00', 'confirmed', '2026-01-14 23:38:40', 0),
(441, 91, 5, '2026-01-15', '05:00:00', '06:00:00', 'confirmed', '2026-01-14 23:44:59', 0);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `Staff`
--

CREATE TABLE `Staff` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` enum('Entrenador','Fisioterapia','Admin','Spa') NOT NULL,
  `priority_order` int(11) DEFAULT '99',
  `is_active` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Volcado de datos para la tabla `Staff`
--

INSERT INTO `Staff` (`id`, `name`, `email`, `password`, `role`, `priority_order`, `is_active`) VALUES
(3, 'Adriana', 'adrianaentrenador1@cardiofitlab.com', 'Entrenador1*', 'Entrenador', 1, 1),
(4, 'Jorge Rodriguez', 'jorgeentrenador2@cardiofitlab.com', 'Entrenador2*', 'Entrenador', 2, 1),
(5, 'Ivan', 'ivanentrenador3@cardiofitlab.com', 'Entrenador3*', 'Entrenador', 3, 1),
(6, 'Jonathan', 'jonathanentrenador4@cardiofitlab.com', 'Entrenador4*', 'Entrenador', 4, 1),
(7, 'David', 'davidentrenador5@cardiofitlab.com', 'Entrenador5*', 'Entrenador', 5, 1),
(8, 'Alexandra Mejia', 'alexandramejiaspa@cardiofitlab.com', 'Spa123*', 'Spa', 10, 1),
(9, 'Edna Rengifo', 'ednarengifo@cardiofitlab.com', 'Fisioterapia*', 'Fisioterapia', 11, 1),
(10, 'Mafe', 'mariafernandasanchez@cardiofitlab.com', '123456Mafe', 'Admin', 12, 0);

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
  `F_CITA_MED_DEPORTIVA` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
(5, 'FERNANDO TRUJILLO', '2026-01-08', '2026-02-08', 'Experiencia fitnes plan de lujo + personalizado', 'ACTIVO', '9088155', '1952-01-12', 71, 'M', '2024-08-15', NULL, NULL, '', '3153192432', 'calamar89@hotmail.com', NULL, NULL),
(6, 'Enrique Mejia Fortich', '2024-08-02', NULL, 'Experiencia Fitness plan básico + Perso 2', 'ACTIVO', '14213171', '1952-08-19', 71, 'M', '2024-08-05', '2024-08-05', NULL, NULL, '3167424382', 'enrique.mejia@segurosmejia.co', NULL, NULL),
(7, 'Ricardo Mejia Fortich', '2026-01-05', '2026-02-05', 'Experiencia Fitness plan básico + Personalizado pareja', 'ACTIVO', '14222198', '1958-01-15', 66, 'M', '2024-08-05', '2024-08-05', NULL, '', '3187171707', 'ricmejia78@hotmail.com', NULL, NULL),
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
(49, '6 Fernanda Luna', '2026-01-05', '2026-02-05', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '', '1980-09-24', 45, 'F', '2024-04-17', '2024-04-25', NULL, '', '', '', NULL, NULL),
(50, 'Mauricio Poveda', '2026-01-05', '2026-02-05', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '80039829', '1982-12-04', 43, 'M', '2024-04-17', '2024-04-25', NULL, '', '', '', NULL, NULL),
(51, 'Alvaro Parra', '2024-04-24', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '1969-06-12', 55, 'M', '2024-04-30', '2024-05-16', NULL, NULL, '3168338058', NULL, NULL, NULL),
(52, 'Carlos Eduardo Avila', '2024-04-25', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', '93238161', '1985-02-19', 39, 'M', '2024-04-26', '2024-05-07', NULL, NULL, '3002163497', 'ceareinoso@gmail.com', NULL, NULL),
(53, '1 Andrea Trujillo', '2024-05-08', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'INACTIVO', '', '1992-06-27', 32, 'F', NULL, '2024-05-30', NULL, '', '', '', NULL, NULL),
(54, '1 German Ruiz', '2024-05-08', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'INACTIVO', '', '2024-11-25', NULL, 'M', NULL, '2024-05-30', NULL, '', '', '', NULL, NULL),
(55, '77 Jesus Rueda', '2024-05-15', NULL, 'Experiencia fitness plan basico', 'ACTIVO', NULL, '1992-10-22', 31, 'M', '2024-05-15', '2024-05-30', NULL, NULL, '3202147750', 'Ing.jesusrueda@.gmail.com', NULL, NULL),
(56, '77 Francys Perez', NULL, NULL, 'Experiencia fitness plan basico', 'ACTIVO', NULL, '1993-06-14', 31, 'F', '2024-05-20', '2024-05-30', NULL, NULL, NULL, 'Lic.francysperez@.gmail.com', NULL, NULL),
(57, 'Angie Vanessa Vieda', '2024-05-22', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '1998-06-07', 25, 'F', '2024-05-24', NULL, NULL, NULL, '3158845434', 'VANESSAVIEDA@HOTMAIL.COM', NULL, NULL),
(58, '2 Francisco Ivan Mejia', '2024-05-23', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'INACTIVO', '', '1962-09-14', 62, 'M', '2024-05-23', '2024-06-11', NULL, '', '', '', NULL, NULL),
(59, '2 Maria Eugenia Cuellar', '2024-05-23', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'INACTIVO', '', '1963-11-20', 60, 'F', '2024-05-23', '2024-06-11', NULL, '', '3208399374', 'MARIAEU2063@HOTMAIL.COM', NULL, NULL),
(60, 'Stevan Parra Torres', '2024-06-15', NULL, 'Experiencia Fitness plan basico', 'INACTIVO', NULL, '2005-11-15', 18, 'M', '2024-06-18', '2024-07-04', NULL, NULL, '3246841414', 'stsesa100@hotmail.com', NULL, NULL),
(61, 'Johanna Carolina Giraldo Alzate', '2024-07-22', NULL, 'Dr Poveda', 'INACTIVO', NULL, '1985-08-01', 39, 'M', '2024-07-08', NULL, NULL, NULL, '3152950023', 'johannacarolinagiraldo@hotmail.com', NULL, NULL),
(62, '11 Efren Leonardo Sosa Bonilla', '2024-07-21', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'INACTIVO', '', '1993-11-11', NULL, 'M', '2024-07-19', '2024-07-22', '2024-07-19', '', '3214404983', 'efrenl.sosab@gmail.com', NULL, NULL),
(63, '11 Alexandra Quijano Saavedra', '2024-07-21', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1997-06-25', NULL, 'F', '2024-07-19', '2024-07-22', '2024-07-19', NULL, '3183837078', 'alex22quijano@gmail.com', NULL, NULL),
(64, 'Luisa Fernanda Bulla', '2024-07-22', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1996-03-18', 28, 'F', NULL, NULL, NULL, NULL, '3015044411', 'luisabulla1@hotmail.com', NULL, NULL),
(65, 'Esther Manuela Lopez Cardozo', '2024-07-17', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '2001-03-05', 23, 'F', NULL, NULL, NULL, NULL, '3168296286', 'manuelalopez124@gmail.com', NULL, NULL),
(66, 'Andrea Marcela Ortiz Rojas', '2024-07-12', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1996-08-28', 27, 'F', '2024-08-17', '2024-08-01', '2024-08-17', NULL, '3170195974', 'andreaamor28@hotmail.com', NULL, NULL),
(67, 'Angie Jasbleidy Librado Bernal', '2024-07-10', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1992-07-08', 32, 'F', '2024-07-10', '2024-07-29', '2024-07-16', NULL, '3043362599', 'anjalibe16@hotmail.com', NULL, NULL),
(68, 'Brigitte Caviedes Rodriguez', '2023-10-11', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1981-12-02', 42, 'F', NULL, NULL, NULL, NULL, '3202033747', 'caviedesbrigitte@gmail.com', NULL, NULL),
(69, 'Nestor Eduardo Guerrero', '2023-09-25', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1988-07-04', 35, 'M', NULL, NULL, NULL, NULL, '3102393867', 'negma_7@hotmail.com', NULL, NULL),
(70, '3 Andres Felipe Lievano', '2023-09-27', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1997-11-26', 25, 'M', '2023-09-27', '2023-10-02', NULL, NULL, '3147553813', 'Andreslievano0804@gmail.com', NULL, NULL),
(71, '3 Angela Gabriela Cantillo Suarez', '2023-09-27', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '', '2001-12-28', 28, 'F', '2023-09-27', '2023-10-02', NULL, '', '3104690503', 'Acantillosuarez9@gmail.com', NULL, NULL),
(72, '66 Jennifer Cifuentes', '2023-10-24', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1990-07-29', 33, 'F', '2023-10-24', NULL, '2024-07-10', NULL, '3004624431', 'jen_cifuentes@hotmail.com', NULL, NULL),
(73, '5 Camila Grisales', '2023-10-25', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1994-06-25', 30, 'F', '2023-10-25', NULL, NULL, NULL, '317 3775121', 'camilgri@hotmail.com', NULL, NULL),
(74, 'V. Alba Luz Russi', '2024-01-02', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '23555330', '1962-04-22', 61, 'F', '2024-01-02', NULL, NULL, NULL, '312 4985146', 'alba.russi@hotmail.com', NULL, NULL),
(75, 'V. Blanca Russi', '2024-01-02', NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, NULL, 59, 'F', '2024-01-02', '2024-02-02', NULL, NULL, '323 5900959', 'blanrussi30@gmail.com', NULL, NULL),
(76, 'Maria Ema Ropero', '2024-01-29', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1944-04-17', 70, 'F', '2024-01-29', NULL, '2024-07-11', NULL, '3014086698', 'melytery7@gmail.com', NULL, NULL),
(77, '4 Andrés Felipe Canizales', '2024-01-29', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1110480346', '1988-12-16', 38, 'M', '2024-02-03', NULL, NULL, '', '3143328547', 'Andrésfelipe_90210@hotmail.com', NULL, NULL),
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
(89, '2 Camilo Martinez', '2024-04-03', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '80214076', '1983-07-23', 40, 'M', '2024-04-03', '2024-04-11', NULL, '', '3107828656', '', NULL, NULL),
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
(136, 'Luz Tovar', '2026-01-05', '2026-02-05', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '', '1998-09-22', 26, 'F', '2024-10-01', NULL, NULL, '', '3154182438', 'luzetovarg@gmail.com', NULL, NULL),
(137, 'Daniela Barrera', '2024-10-02', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1999-07-07', 25, 'F', '2024-10-02', NULL, NULL, NULL, '3133665270', 'daniela.barrera.charry@gmail.com', NULL, NULL),
(138, 'David Francisco Rubio Rojas', '2024-10-02', NULL, 'Experiencia Fitness plan de lujo', 'INACTIVO', NULL, '1983-05-21', 41, 'M', '2024-10-02', NULL, NULL, NULL, '3214112904', 'david.rubio@dr.com', NULL, NULL),
(139, 'Sofia Barreto', '2026-01-09', '2026-02-09', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1128269616', '1987-02-25', 37, 'F', '2024-10-02', NULL, NULL, '', '3002128762', 'sofia250287@yahoo.com', NULL, NULL),
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
(153, 'Diana Marcela Barreto', '2026-01-05', '2026-02-05', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '28552929', '1982-03-29', 42, 'F', NULL, NULL, NULL, '', '3002204604', 'marcelabarretoparra@hotmail.com', NULL, NULL),
(154, 'Elena Callejas', '2024-10-21', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '52409787', '1979-10-27', 44, 'F', '2024-10-17', NULL, NULL, '', '3042910916', 'hele_1027@hotmail.com', NULL, NULL),
(155, 'Jaison Caro Tafur', '2024-10-23', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1977-11-07', 46, 'M', '2024-10-30', NULL, NULL, NULL, '3212107929', 'jaison.caro@gmail.com', NULL, NULL),
(156, 'Diego Marmolejo', '2024-10-25', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', '93375409', '1977-03-27', 47, 'M', '2024-09-20', NULL, NULL, NULL, '3507172971', 'diegomarmolejo@gmail.com', NULL, NULL),
(157, 'Fabian Andres Pulido', '2024-11-07', NULL, 'Experiencia Fitness plan de lujo', 'ACTIVO', '1800888', '1979-09-12', 45, 'M', NULL, NULL, NULL, '', '3106989498', 'fpulido12@gmail.com', NULL, NULL),
(158, 'Felipe Bahamon', '2024-10-29', NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1984-12-24', 39, 'M', NULL, NULL, NULL, NULL, '3106196652', 'pipebahamon@hotmail.com', NULL, NULL),
(159, 'Laura Medina', '2024-11-01', NULL, 'Experiencia Fitness plan de lujo', 'INACTIVO', NULL, '1993-06-04', 31, 'F', '2024-11-06', NULL, NULL, NULL, '3123251256', 'lauradanielamedinag@gmail.com', NULL, NULL),
(160, 'Jaime Fernando Hernandez', '2024-11-06', NULL, 'Experiencia Fitness plan de fitness', 'INACTIVO', NULL, '1974-04-18', 50, 'M', '2024-11-05', NULL, NULL, NULL, '3167442472', 'fernando_hernandezo@yahoo.com', NULL, NULL),
(161, 'Adriana Tovar', '2024-12-08', NULL, 'Experiencia Fitness Plan Basico', 'ACTIVO', '38362337', '1983-08-09', 41, 'F', '2024-11-08', NULL, NULL, NULL, '3183621000', 'adrianatovarseguros@hotmail.com', NULL, NULL),
(162, 'Lorena Barrios', NULL, NULL, 'Experiencia Fitness Plan Basico', 'INACTIVO', NULL, '1987-02-03', 37, 'F', '2024-11-07', NULL, NULL, NULL, '3002616407', 'lorenabarrios0304@hotmail.com', NULL, NULL),
(163, 'Monica Gutierrez', NULL, NULL, 'Experiencia Fitness plan de lujo', 'ACTIVO', NULL, '1990-10-06', 34, 'F', '2024-11-22', NULL, NULL, NULL, '3175438721', 'monica_gutierrezp@hotmail.com', NULL, NULL),
(164, 'Camilo Espitia', '2024-11-25', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, NULL, 40, NULL, '2024-01-24', '2024-02-06', NULL, NULL, '3152789050', 'marthapalaciosuribe@gmail.com', NULL, NULL),
(165, 'Maria Alejandra Espitia Palacios', '2026-01-05', '2026-02-05', 'PLAN BÁSICO PERSONALIZADO', 'ACTIVO', '', NULL, 12, 'M', '2024-01-16', '2024-02-06', NULL, '', '3152789050', 'mariaalejandaespitiapalacion@gmail.com', NULL, NULL),
(166, 'Maria Camila Espitia Palacios', '2026-01-05', '2026-02-05', 'PLAN BÁSICO PERSONALIZADO', 'ACTIVO', '', NULL, 6, 'M', '2024-01-18', '2024-02-06', NULL, '', '3152789050', 'marthapalaciosuribe@hotmail.com.com', NULL, NULL),
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
(183, 'Edna Lorena Romero', NULL, NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1110539355', NULL, 31, 'F', NULL, NULL, NULL, '', '3105178986', '', NULL, NULL),
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
(197, 'Andres Felipe Lievano', NULL, NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '11105876536', '1997-11-26', NULL, 'M', NULL, NULL, NULL, '', '3147553813', 'andreslievano0804@gmail.com', NULL, NULL),
(198, 'Gabriela Cantillo Suarez', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '1004355097', '2001-12-28', NULL, 'F', NULL, NULL, NULL, NULL, '3104690503', 'acantillosuarez9@gmail.com', NULL, NULL),
(199, 'Jennifer Cifuentes', NULL, NULL, 'Experiencia Fitness plan basico', 'ACTIVO', '1018436848', '1990-07-29', NULL, 'F', NULL, NULL, NULL, '', '3004624431', '', NULL, NULL),
(200, 'Juanita Cortes', NULL, NULL, 'Experiencia Fitness plan basico + Personalizado', 'INACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(201, 'Stiven Gonzales', '2026-01-13', '2026-01-13', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1110561162', '1995-06-05', NULL, 'M', NULL, NULL, NULL, '', '3172680716', 'stevengm45@gmail.com', NULL, NULL),
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
(215, 'Maria Camila Grisales', '2023-10-25', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'INACTIVO', '1110548374', '1994-06-25', 29, 'M', '2023-10-25', NULL, NULL, '', '317 3775121', 'camilgri@hotmail.com', NULL, NULL),
(216, 'Esteban Robayo Rodriguez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '2008-07-04', 16, 'M', '2025-01-27', NULL, NULL, NULL, '3053715704', 'mdjlrr3@gmail.com', NULL, NULL),
(217, 'Alejandra Prada Marmolejo', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110518108', '1991-12-12', 33, 'F', '2025-01-24', NULL, NULL, NULL, '3043752729', 'alejandrapradamgmail.com', NULL, NULL),
(218, 'Jorge Lara Salinas', '2025-03-03', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '79334599', '1965-02-05', 60, 'M', NULL, NULL, NULL, NULL, '3155183440', 'jlarasainas@hotmail.com', NULL, NULL),
(219, 'Andres Garcia', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '14136418', '1983-01-03', 41, 'M', '2025-01-08', NULL, NULL, NULL, '317 5166467', 'sndremv84@hotmail.com', NULL, NULL),
(220, 'Ana Milena Orjuela', NULL, NULL, 'Experiencia Fitness plan de lujo', 'ACTIVO', '52747445', NULL, NULL, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(221, 'Jesus Rueda', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '162028221', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(222, 'Jhon Jairo Nova', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '93405969', '1977-10-04', 47, 'M', NULL, NULL, NULL, NULL, '3167822188', 'jhonjaironovavelazques@gmail.com', NULL, NULL),
(223, 'Daniel Templeton', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110573021', '1996-07-20', 28, 'M', NULL, NULL, NULL, NULL, NULL, 'dtemvas1@gmail.com', NULL, NULL),
(224, 'Luisa Castillo', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1234645846', '1999-10-16', 25, 'F', NULL, NULL, NULL, NULL, '3102668146', 'luisa-forero@hotmail.com', NULL, NULL),
(225, 'Michael Nicholas Diaz Martinez', '2026-01-05', '2026-02-05', 'Experiencia Fitness plan Lujo + personalizado', 'ACTIVO', '1110509378', '1991-04-01', 33, 'M', NULL, NULL, NULL, '', '3195063363', 'M.NICHOLAS.DIAZ@GMAIL.COM', NULL, NULL),
(226, 'Juan Diego Talero', '2026-01-14', '2026-02-14', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1105470503', '2010-02-24', 15, 'M', NULL, NULL, NULL, '', '3158733356', 'lilianaperillamar@gmail.com', NULL, NULL),
(227, 'Yesid Sanchez Jimenez', '2023-10-09', NULL, '', 'ACTIVO', '7545554', '2024-07-13', 60, 'M', NULL, NULL, NULL, '', '3114624075', 'pispa1@icloud.com', NULL, NULL),
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
(239, 'Lida Mayerly Murillo', NULL, NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '38144421', '1981-01-24', 44, 'F', NULL, NULL, NULL, '', '3175164867', 'maye.murillo@hotmail.com', NULL, NULL),
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
(249, 'Maria Alejandra Rodriguez Ospina', '2026-01-13', '2026-02-13', 'Experiencia Fitness plan Lujo', 'ACTIVO', '1110565875', '1995-12-03', 29, 'F', NULL, NULL, NULL, '', '3178359743', 'maleja_rod@hotmail.com', NULL, NULL),
(250, 'Nicolas  Rodriguez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110594600', '1998-11-14', 26, 'M', NULL, NULL, NULL, NULL, '3144907334', 'nicolas1114@hotmail.com', NULL, NULL),
(251, 'Esteban Robayo Rodriguez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '11105467909', '2008-07-04', 16, 'M', NULL, NULL, NULL, NULL, '3053715704', 'mdjlrr3@gmail.com', NULL, NULL),
(252, 'Alejandra Prada Marmolejo', '2026-01-08', '2026-02-08', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1110518108', '1991-12-12', 33, 'F', NULL, NULL, NULL, '', '3043752729', 'alejandrapradam@gmail.com', NULL, NULL),
(253, 'Luisa Castillo', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1234645846', '1999-10-16', 25, 'F', NULL, NULL, NULL, NULL, '3102668146', 'luisa-forero@hotmail.com', NULL, NULL),
(254, 'CESAR VEJARANO', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '93411920', '1979-02-17', 46, 'M', NULL, NULL, NULL, NULL, '3004449075', 'w_s.cesar@outlook.com', NULL, NULL),
(255, 'ANDREA RINCON', '2026-01-06', '2026-02-06', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '52816111', '1982-10-03', 42, 'F', NULL, NULL, NULL, '', '3005380930', 'handreita103@hotmail.com', NULL, NULL),
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
(271, 'Elizabeth Santos Roa', NULL, NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'INACTIVO', '65746858', '1970-08-15', 54, 'F', NULL, NULL, NULL, '', '3114860072', 'santoroa@yahoo.com', NULL, NULL),
(272, 'Carlos Carvajal Ramirez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1105677753', '1989-03-07', 36, 'M', NULL, NULL, NULL, NULL, '3106598428', 'gerenciacacr@gmail.com', NULL, NULL),
(273, 'Maria Alejandra Rivera', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1020718923', '1986-07-26', 38, 'F', '2025-02-20', NULL, NULL, NULL, '3208088920', 'marialeja_13@hotmail.com', NULL, NULL),
(274, 'Angelica Maria Cruz', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '52841501', '1981-12-20', 43, 'F', '2025-03-19', NULL, NULL, NULL, '3162314560', 'angelica@torrenegra.co', NULL, NULL),
(275, 'Sandra Benitez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110570101', '2025-04-09', 29, 'F', NULL, NULL, NULL, NULL, '3024640657', 'sandrabenitez1679@gmail.com', NULL, NULL),
(276, 'Angélica Maria García', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110478033', '1988-07-23', 37, 'F', '2025-03-28', NULL, NULL, NULL, '3168730751', 'amagapra@hotmail.com', NULL, NULL),
(277, 'Daniel felipe Sanchez', NULL, NULL, 'Experiencia Fitness plan básico+Personalizado', 'ACTIVO', '1193105997', '2001-03-31', 24, 'M', '2025-04-02', NULL, NULL, NULL, '3188674755', 'correosanchez099@gmail.com', NULL, NULL),
(278, 'Lorena Pinto', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110560622', NULL, 29, 'F', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(279, 'Angie Librado', NULL, NULL, '', 'INACTIVO', '', NULL, 32, 'F', NULL, NULL, NULL, '', '', '', NULL, NULL),
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
(295, 'Karol Hernandez Cortes', NULL, NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'INACTIVO', '36305501', '1982-09-03', 43, 'F', NULL, NULL, NULL, '', '3176607400', 'carolhernadez106@hotmail.com', NULL, NULL),
(296, 'Sandra Varón', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '28544850', '1980-11-29', 44, 'F', NULL, NULL, NULL, NULL, '3144723565', 'sandravconcejalibague@gmail.com', NULL, NULL),
(297, 'Natalia Andrea Romero Martínez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1018455672', '1992-11-14', 32, 'M', NULL, NULL, NULL, NULL, '3156060152', 'nataliaromero921114542@gmail.com', NULL, NULL),
(298, 'Maria Cristina Gomez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '41107403', '1973-02-25', 52, 'F', NULL, NULL, NULL, NULL, '3133364319', 'jwogomez@hotmail.com', NULL, NULL),
(299, 'Maria Alejandra Rodriguez Ospina', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110565875', '1995-12-03', 29, 'F', NULL, NULL, NULL, NULL, '3178359743', 'maleja_rod@hotmail.com', NULL, NULL),
(300, 'Yaldrin Valentina Mendoza', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '11045444413', '2004-05-07', 21, 'F', NULL, NULL, NULL, NULL, '3153850798', 'yaldrinmendoza@gmail.com', NULL, NULL),
(301, 'Danna Ospina', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '11014148638', '2011-05-01', 14, 'F', NULL, NULL, NULL, NULL, '3213939508', 'jwogomez@hotmail.com', NULL, NULL),
(302, 'Gloria Gomez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '41145171', '1983-08-08', 41, 'F', NULL, NULL, NULL, NULL, '3133532235', 'jwogomez@hotmail.com', NULL, NULL),
(303, 'Jennifer pinto', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1094266209', '1990-10-16', 34, 'F', NULL, NULL, NULL, NULL, '3206233256', 'jp_mayorga@hotmail.com', NULL, NULL),
(304, 'Alma Esperanza Moscoso', '2026-01-08', '2026-02-08', 'PLAN BÁSICO PERSONALIZADO', 'ACTIVO', '51724171', '1963-07-12', 61, 'F', NULL, NULL, NULL, '', '3182190008', 'almaesperanza2003@gmail.com', NULL, NULL),
(305, 'Valeria Campos Guzmán', NULL, NULL, '', 'ACTIVO', '1110586186', '1997-11-14', 27, 'F', NULL, NULL, NULL, '', '316 5395304', 'Valecamposg@hotmail.com', NULL, NULL),
(306, 'Jose Guillermo Gonzalez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '93407709', '1977-10-04', 47, 'M', '2025-05-21', NULL, NULL, NULL, '3166884960', 'guillegonzalez.gonzalez@gmail.com', NULL, NULL),
(307, 'Andres Felipe Moreno Rojas', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', 'TI1031819748', '2009-09-26', 15, 'M', NULL, NULL, NULL, NULL, '3133936961', 'diannna.florez@hotmail.com', NULL, NULL),
(308, 'Emilio Gabriel Botero Arbelaez', NULL, NULL, 'Experiencia Fitness plan básico+Personalizado', 'INACTIVO', '1201468942', '2015-01-05', 10, 'M', '2025-05-26', NULL, NULL, NULL, '3208565148', 'ffbotero@gmail.com', NULL, NULL),
(309, 'Nidia Perez', NULL, NULL, 'Experiencia Fitness plan básico+Personalizado', 'INACTIVO', '6569680', '1958-12-01', 66, 'F', '2025-05-27', NULL, NULL, NULL, '3023629699', NULL, NULL, NULL),
(310, 'Juan Carlos Herran Seyes', NULL, NULL, 'Experiencia Fitness plan Lujo', 'INACTIVO', '93393744', '1974-09-06', 50, 'M', NULL, NULL, NULL, NULL, '3182098074', 'jcherrac@gmail.com', NULL, NULL),
(311, 'Fabian Marcel Lozano', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '93236656', '1984-11-10', 40, 'M', '2025-05-30', NULL, NULL, NULL, '3134302190', 'fabianlozanohyh@gmail.com', NULL, NULL),
(312, 'Yenny Lorena Tejada Villanueva', NULL, NULL, '', 'INACTIVO', '1110494397', '1989-11-24', 35, 'F', NULL, NULL, NULL, '', '3123506892', 'jenny.890@hotmail.com', NULL, NULL),
(313, 'Cesar Augusto Cobaleda Luna', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '5829441', '1981-01-14', 44, 'M', NULL, NULL, NULL, NULL, '3118480350', 'cecobaluna@hotmail.com', NULL, NULL),
(314, 'Laura Sofia Villarreal Santos', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1005912225', '2003-09-22', 21, 'F', NULL, NULL, NULL, NULL, '3007591050', 'laura.villarrealsantos@gmail.com', NULL, NULL),
(315, 'Simo Botero Arbelaez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1201446441', '2013-02-11', 12, 'M', NULL, NULL, NULL, NULL, '3208565148', 'danyarlo@hotmail.com', NULL, NULL),
(316, 'Elizabeth Diaz Carvajal', NULL, NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'INACTIVO', '1105464085', '2006-08-14', 18, 'F', NULL, NULL, NULL, '', '3044943841', 'elizabethdiazcarvajal140608@gmail.com', NULL, NULL),
(317, 'Consuelo Cuenca', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '39539484', '1966-07-21', 58, 'F', NULL, NULL, NULL, NULL, '3173643445', 'ana.cuenca2107@gmail.com', NULL, NULL),
(318, 'Mike Leandro Campaz', NULL, NULL, 'terapia Fisica', 'ACTIVO', '1122516181', '2007-08-07', 17, 'M', NULL, NULL, NULL, NULL, '3116313913', 'mikecampaz78@hotmail.com', NULL, NULL),
(319, 'Juan Sebastian Herran Rodríguez', NULL, NULL, '', 'INACTIVO', '1104947057', '2011-01-02', 14, 'M', NULL, NULL, NULL, '', '3182098074', 'jcherrac@gmail.com', NULL, NULL),
(320, 'Joaquin Poveda Wilches', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1014888438', '2015-01-24', 10, 'M', NULL, NULL, NULL, NULL, '3012848370', 'sandrawilches27@gmail.com', NULL, NULL),
(321, 'Juan Diego Espejo', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1070589689', '2005-08-08', 20, 'M', NULL, NULL, NULL, NULL, '3133753529', 'juandivolador@gmail.com', NULL, NULL),
(322, 'Camilo Caina', NULL, NULL, 'Experiencia Fitness plan Lujo', 'ACTIVO', '1197465094', '2011-03-15', 14, 'M', '2025-06-20', NULL, NULL, NULL, '3173319705', 'lelogallego@hotmail.com', NULL, NULL),
(323, 'Carlos David Lobón', NULL, NULL, 'EMBAJADOR', 'INACTIVO', '1110477199', '1988-10-05', 36, 'M', NULL, NULL, NULL, NULL, '3208290160', 'davidlobon88david@gmail.com', NULL, NULL),
(324, 'Olga Lucia Marulanda Rodriguez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '28837392', '1964-08-29', 60, 'F', NULL, NULL, NULL, NULL, '3232300636', 'rosmayra26@gmail.com', NULL, NULL),
(325, 'Claudia Yohana Silva', '2026-01-05', '2026-02-05', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '65754277', '1972-04-11', 53, 'F', '2025-06-19', NULL, NULL, '', '3002082638', 'arqtata@hotmail.com', NULL, NULL),
(326, 'Luz Ines Ramirez Jimenez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', NULL, '1970-10-09', 54, 'F', '2025-06-19', NULL, NULL, NULL, '3163562954', 'luzinesramirez@gmail.com', NULL, NULL),
(327, 'Juliana Díaz Carvajal', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1104548978', '2012-10-04', 13, 'F', '2025-06-20', NULL, NULL, NULL, '3144442447', 'johana.carvajal@controlambiental.com.co', NULL, NULL),
(328, 'Francisco Oviedo Hernandez', NULL, NULL, NULL, 'INACTIVO', '93367821', '1967-01-01', 58, 'M', NULL, NULL, NULL, NULL, '3163815529', 'franciscoviedo01@hotmail.com', NULL, NULL),
(329, 'Delsy Esperanza Isaza', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65808881', '1978-08-05', 46, 'F', NULL, NULL, NULL, NULL, '3107847928', 'delcisaza@yahoo.com', NULL, NULL),
(330, 'Felipe Bocanegra', '2026-01-05', '2026-02-05', 'Experiencia Fitness plan básico+Personalizado', 'ACTIVO', '1110534351', '1993-03-19', 32, 'M', '2025-07-01', NULL, NULL, '', '3213708267', 'lfbocanegra1@gmail.com', NULL, NULL),
(331, 'Isabella Reyes Giraldo', NULL, NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', '1197464881', '2010-12-24', 14, 'F', NULL, NULL, NULL, NULL, '3213250962', 'juan10andres11acosta12@gmail.com', NULL, NULL),
(332, 'Juan David Lopez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1234638027', '1997-05-28', 28, 'M', NULL, NULL, NULL, NULL, '3004080262', 'juandlopez628@gmail.com', NULL, NULL),
(333, 'Saul Fernando Rodriguez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '19261461', '1955-06-24', 70, 'M', '2025-07-09', NULL, NULL, NULL, '3152571942', 'saul.rodriguez@sfr.com.co', NULL, NULL),
(334, 'Sara Fernanda Muñoz Bermudez', '2026-01-06', '2026-02-06', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1019014482', '2004-09-23', 20, 'F', '2025-05-15', NULL, NULL, '', '3227029880', 'sarafernandabermudez@gmail.com', NULL, NULL),
(335, 'Jeimmy Janeth Bermudez Molano', '2026-01-06', '2026-02-06', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1019020222', '1986-11-08', 37, 'F', '2025-05-15', NULL, NULL, '', '3202882009', 'sarafernandabermudez@gmail.com', NULL, NULL),
(336, 'Gloria Patricia Moreno', NULL, NULL, 'ENVIAR GUIA NUTRICIONAL', 'INACTIVO', '38260988', '1967-04-20', 57, 'F', NULL, NULL, NULL, NULL, '3003129443', 'patymorere@hotmail.com', NULL, NULL),
(337, 'Paola Ayerbe Fierro', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1110581624', '1997-04-16', 28, 'F', '2025-07-18', NULL, NULL, NULL, '3182062713', 'paoayer@hotmail.com', NULL, NULL),
(338, 'Juan David Cruz', NULL, NULL, 'terapia Fisica', 'ACTIVO', '1104545118', '2005-03-28', 20, 'M', NULL, NULL, NULL, NULL, '3219483841', 'juancruz200528@gmail.com', NULL, NULL),
(339, 'Diana Cristina Lozano Fuentes', '2026-01-14', '2026-02-14', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '65756317', '1962-10-01', 52, 'F', '2025-07-22', NULL, NULL, '', '3187124566', 'dianacristina1972@hotmail.com', NULL, NULL),
(340, 'Jaime Enesto Baquero barrios', '2026-01-13', '2026-02-13', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '93370265', '1967-10-31', 57, 'F', NULL, NULL, NULL, '', '3188410097', 'jotabaquero90@hotmail.com', NULL, NULL),
(341, 'Sandra Del pilar Pardo Suarez', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '51738153', '1963-06-17', 62, 'F', '2025-07-25', NULL, NULL, NULL, '3102814624', 'aquispps@gmail.com', NULL, NULL),
(342, 'Claudia Julieta Ciro Basto', NULL, NULL, 'Experiencia Fitness plan de fitness', 'ACTIVO', '65755327', '1972-07-29', 53, 'F', '2025-08-01', NULL, NULL, NULL, '3215071208', 'cirobasto.claudiajulieta@gmail.com', NULL, NULL),
(343, 'Nathalia Berrio', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', '1109384667', '1991-09-24', 33, 'F', '2025-07-08', NULL, NULL, NULL, '3183772765', 'nathaliaandreaberrio@hotmail.com', NULL, NULL),
(344, 'Angie Daniela Motta Sanchez', '2026-01-15', '2026-02-15', 'EXPERIENCIA FITNESS DE LUJO', 'ACTIVO', '1110585045', '1997-09-17', 27, 'F', '2025-08-05', NULL, NULL, '', '3229476627', 'angie_17_1997@hotmail.com', NULL, NULL),
(345, 'Santiago José Salazar Pineda', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1106632788', '2005-05-06', 20, 'M', '2025-08-11', NULL, NULL, NULL, '3003178801', 'salazarsantiago570@gmail.com', NULL, NULL),
(346, 'Leidy Cristina Cardenas Bocanegra', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '39580285', '1982-07-12', 43, 'F', '2025-08-08', NULL, NULL, NULL, '3203064917', 'leidygomela12@gmail.com', NULL, NULL),
(347, 'Camila Suarez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1106226496', '2004-12-24', 20, 'F', '2025-08-13', NULL, NULL, NULL, '3025691955', 'mcsm2425@gmail.com', NULL, NULL),
(348, 'Jair Yovanny Castro Morales', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '93405702', '1977-10-27', 47, 'M', '2025-08-14', NULL, NULL, NULL, '3208381211', 'jacasmo@hotmail.com', NULL, NULL),
(349, 'Santiago Hernandez Valencia', NULL, NULL, '', 'INACTIVO', '1110569619', '1996-02-22', 29, 'M', '2025-08-20', NULL, NULL, '', '3123419411', 'lorenapinto0795@hotmail.com', NULL, NULL),
(350, 'Maria Cecilia Guarnizo Mejía', NULL, NULL, 'Experiencia Fitness plan básico', 'INACTIVO', 'TI 1197463244', '2009-03-27', 16, 'F', '2025-08-15', NULL, NULL, NULL, '3144425720', 'guarnizomejiamariacecilia@gmail.com', NULL, NULL),
(351, 'Liby Yalexi Reyes Chilatra', NULL, NULL, 'Terapia física', 'ACTIVO', '1110481679', '1989-02-13', 36, 'F', '2025-08-20', NULL, NULL, NULL, '3158241082', 'liyare.reyes@gmail.com', NULL, NULL),
(352, 'Gabriel Enrique Jauregui', '2026-01-14', '2026-02-14', 'EXPERIENCIA FITNESS PLAN BÁSICO + PERSONALIZADO PAREJA', 'ACTIVO', '1100976569', '1995-08-24', 30, 'M', '2025-07-17', NULL, NULL, '', '3113679782', 'gabrielpoleo8@gmail.com', NULL, NULL),
(353, 'Luis Eduardo Santos Gonzañez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '93238463', '1982-04-22', 43, 'M', '2025-07-23', NULL, NULL, NULL, '3108036132', 'leidygomela12@gmail.com', NULL, NULL),
(354, 'Isabella Reyes Giraldo', NULL, NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', 'TI 1197464881', '2010-12-24', 14, 'F', '2025-09-17', NULL, NULL, NULL, '316 2925186', 'jessica.giraldo.varon@gmail.com', NULL, NULL),
(355, 'Nubia Consuelo Murillo Cuenca', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65727865', '1965-01-09', 60, 'F', '2025-09-05', NULL, NULL, NULL, '3188055641', 'nuco195@hotmail.com', NULL, NULL),
(356, 'Odilia Del Carmen Delgado de Caina', NULL, NULL, 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', '23270903', '1951-03-02', 74, 'F', '2025-09-02', NULL, NULL, NULL, '3007768531', 'willicaina@hotmail.com', NULL, NULL),
(357, 'Sandra Patricia Wilches Machado', NULL, NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', '65765800', '1975-04-27', 50, 'F', '2025-09-02', NULL, NULL, NULL, '3012848360', 'sandrawilches27@gmail.com', NULL, NULL),
(358, 'Geovanny Alejandro Vargas Chacón', '2026-01-14', '2026-02-14', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '6571988', '2002-05-20', 23, 'M', '2025-07-18', NULL, NULL, '', '3113420568', 'geoalevch@gmail.com', NULL, NULL),
(359, 'Natalia Godoy Triana', '2026-01-12', '2026-02-12', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1127229229', '1987-07-08', 38, 'F', '2025-10-02', NULL, NULL, '', '3187997777', 'godoynata@gmail.com', NULL, NULL),
(360, 'Diana Milena Rivera Gomez', NULL, NULL, 'Experiencia Fitness plan lujo + Personalizado', 'ACTIVO', '52845007', '1982-06-10', 43, 'F', '2025-09-12', NULL, NULL, NULL, '3005325570', 'dmriverago@hotmail.com', NULL, NULL),
(361, 'Diana Patricia Ramirez Lozano', NULL, NULL, 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', '1110473191', '1988-05-01', 37, 'F', '2025-09-15', NULL, NULL, NULL, '3168713388', 'iparalo45@hotmail.com', NULL, NULL),
(362, 'Juan Sebastian Izquierdo Monroy', NULL, NULL, 'Experiencia Fitness de Lujo', 'ACTIVO', '1005716330', '2002-03-05', 23, 'M', '2025-09-17', NULL, NULL, NULL, '3203536770', 'juansebastianmonroy773@gmail.com', NULL, NULL),
(363, 'Mariangel Caro Urrego', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', 'TI 1105469691', '2009-06-03', 16, 'F', '2025-09-19', NULL, NULL, NULL, '3054259939', 'mariangelcarourrego@gmail.com', NULL, NULL),
(364, 'Hellen Chiquinquira Rico Pertuz', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110603423', '1991-04-10', 34, 'F', '2025-09-22', NULL, NULL, NULL, '3208610690', 'hellenrincondiaz@gmail.com', NULL, NULL),
(365, 'German Augenio Alvarado Gaitan', '2026-01-05', '2026-02-05', 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', '14228065', '1959-05-06', 66, 'M', '2025-09-25', NULL, NULL, '', '3102820473', 'german.alvarado@notaria2ibague.com', NULL, NULL),
(366, 'Andres Ortíz', NULL, NULL, 'Terapia Física', 'ACTIVO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(367, 'Hernan Parra Chacón', NULL, NULL, 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', '5945538', '1952-04-21', 73, 'M', '2025-09-26', NULL, NULL, NULL, '3154666229', 'herpacha@yahoo.com', NULL, NULL),
(368, 'Carmen Cecilia Hernandez', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '65735913', '1967-08-24', 57, 'F', '2025-09-26', NULL, NULL, NULL, '3182971566', 'ninaherpa@yahoo-com', NULL, NULL),
(369, 'Sergio Murra Buenaventura', NULL, NULL, '', 'ACTIVO', '1110488330', '1989-09-11', 36, 'M', '2025-10-07', NULL, NULL, '', '3164748017', 'sermurra@hotmail.com', NULL, NULL),
(370, 'Laura Sierra Delgado', NULL, NULL, '', 'ACTIVO', '1016105648', '1998-09-15', 27, 'F', '2025-10-09', NULL, NULL, '', '3212428271', 'laurasd06@gmail.com', NULL, NULL),
(371, 'Adriana Patricia Foronda Mira', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '39355098', '1973-04-17', 52, 'F', '2025-10-09', NULL, NULL, NULL, '3012050185', 'adryforonda0417@gmail.com', NULL, NULL),
(372, 'Nina Patricia Guzman Prada', '2026-01-14', '2026-02-14', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '65747352', '1970-04-30', 55, 'F', '2025-10-10', NULL, NULL, '', '3125646903', 'ninaguzmanp@yahoo.es', NULL, NULL),
(373, 'Juan Carlos Colmenares Peñaloza', '2026-01-14', '2026-02-14', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '93380906', '1989-02-10', 55, 'M', '2025-10-10', NULL, NULL, '', '3174032783', 'lepton2050@gmail.om', NULL, NULL),
(374, 'Yugreidy Dariana Gonzalez Sanchez', NULL, NULL, '', 'INACTIVO', '1094169961', '2004-11-15', 20, 'F', '2025-10-16', NULL, NULL, '', '3113437048', 'darilis2010@hotmail.com', NULL, NULL),
(375, 'Nayury Ceballos Gaspar', '2026-01-15', '2026-02-15', 'Experiencia Fitness de Lujo + personalizado', 'ACTIVO', '38142567', '1980-12-18', 45, 'F', '2025-10-20', NULL, NULL, '', '3114616556', 'nayuceballosg18@gmail.com', NULL, NULL),
(376, 'Napoleon Hernandez Palacios', '2026-01-15', '2026-02-15', 'Experiencia Fitness de Lujo + personalizado', 'ACTIVO', '14243683', '1963-06-01', 62, 'M', '2025-10-20', NULL, NULL, '', '3160888828', 'napoleo.h01@gmail.com', NULL, NULL),
(377, 'Ana Milena Barreto Acevedo', NULL, NULL, 'Experiencia Fitness', 'ACTIVO', '1110533217', '1993-03-13', 32, 'F', '2025-10-21', NULL, NULL, NULL, '3203044761', 'milenabarreto30@gmail.com', NULL, NULL),
(378, 'Isabella Castillo Urbano', NULL, NULL, 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', 'TI 1106228457', '2008-12-29', 16, 'F', '2025-10-21', NULL, NULL, NULL, '3185597911', 'castilloisabella608@gmail.com', NULL, NULL),
(379, 'Valentina Martinez Rojas', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', '1110592605', '1998-08-19', 27, 'F', '2025-10-23', NULL, NULL, NULL, '3203703045', 'valen9808mr@hotmail.com', NULL, NULL),
(380, 'Erika Marcela Constain Valencia', NULL, NULL, '', 'ACTIVO', '1053849833', '1996-05-10', 28, 'F', '2025-10-28', NULL, NULL, '', '3186189305', 'emcv1234@gmail.com', NULL, NULL),
(381, 'Manuel Jose Rodriguez Cardozo', NULL, NULL, 'Experiencia Fitness plan básico+Personalizado', 'ACTIVO', '14240515', '1962-06-23', 63, 'M', '2025-11-04', NULL, NULL, NULL, '3183583132', 'yanedmarirodriguezp@gmail.com', NULL, NULL),
(382, 'Oscar Javier Nuñez Diaz', NULL, NULL, 'Experiencia Fitness de Lujo + personalizado', 'ACTIVO', '5821939', '1980-06-07', 45, 'M', '2025-11-05', NULL, NULL, NULL, '3246815574', 'oscarjavier170@hotmail.com', NULL, NULL),
(383, 'Angela Milena Saavedra Avila', '2026-01-08', '2026-02-08', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '37995083', '1985-04-05', 40, 'F', '2025-11-04', NULL, NULL, '', '3232086663', 'angimi1205@gmail.com', NULL, NULL),
(384, 'Alan Mauricio Rondon', NULL, NULL, 'Experiencia Fitness plan básico', 'ACTIVO', 'TI 1197463881', '2009-11-14', 16, 'M', '2025-11-14', NULL, NULL, NULL, '3232169403', 'bibi290580@gmail.com', NULL, NULL),
(417, 'Andrés', NULL, NULL, 'Clase de cortesía', NULL, '123456', NULL, NULL, NULL, NULL, NULL, NULL, 'Puedrapintada', '573108169617', 'andreslibreros85@gmail.com', NULL, NULL),
(418, 'PREBA 1', '2025-12-15', '2026-01-31', 'PLAN BÁSICO PERSONALIZADO', 'ACTIVO', '1122532', '2000-05-22', NULL, 'M', NULL, NULL, NULL, 'Samaria', '3107568987', 'nelsoncano.@gmail.com', '2026-01-14', '2025-12-29'),
(419, 'PRUEBA 2', '2025-12-29', '2026-01-29', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '22553360', '2013-06-18', NULL, 'F', NULL, NULL, NULL, 'SANTA ANA', '3115274150', 'MARIAFER.15@GMAIL.COM', NULL, NULL),
(420, 'Didier Asprilla Perea', '2026-01-13', '2026-02-13', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '11804527', '1976-08-31', NULL, 'M', '2026-01-16', NULL, NULL, 'Papayo', '3212425821', 'didasp01@yahoo.es', NULL, NULL),
(421, 'Isaac Duran Cruz', '2026-01-07', '2026-02-07', 'PLAN BÁSICO PERSONALIZADO', 'ACTIVO', '14236493', '1961-01-29', NULL, 'M', '2026-01-06', NULL, NULL, 'Balcones del Vergel', '3143589090', 'isaacdurancruz1961@gmail.com', NULL, NULL),
(422, 'Larry garcia', '2026-01-10', '2026-02-10', 'EXPERIENCIA FITNESS (ESTÁNDAR)', 'ACTIVO', '1109000587', '2003-07-10', NULL, 'M', NULL, NULL, NULL, 'Rovira22', '3173328716', 'garcialarry575@gmail.com', NULL, NULL),
(423, 'Maria Camila Ocampo Gómez', '2025-12-16', '2026-01-16', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1110589367', '1998-04-03', NULL, 'F', '2026-01-14', NULL, NULL, '', '3214882268', 'camilaocampogomez@hotmail.com', NULL, NULL),
(424, 'Jorge Prada Sanchez', '2026-01-05', '2026-02-05', 'Experiencia Fitness plan básico+Personalizado', 'ACTIVO', '93117286', '1959-11-30', NULL, 'M', NULL, '2026-01-13', NULL, '', '3002009363', 'jorprasan@hotmail.com', NULL, NULL),
(425, 'Nikolas Caviede Guzmán', '2025-12-01', '2026-01-01', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', 'TI 1105474618', '2014-11-10', NULL, 'M', NULL, NULL, NULL, '', '3167521142', 'yelenitagp@gmail.com', NULL, NULL),
(426, 'Claudia Fernanda Hernandez', '2025-12-10', '2026-01-10', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1105462342', '2005-08-12', NULL, 'F', '2025-12-09', NULL, NULL, '', '3222181444', 'claudia.hernandez.c08@gmail.com', NULL, NULL),
(427, 'Andrea Araque Benavides', '2025-12-17', '2026-01-29', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '33368508', '1983-05-25', NULL, 'F', '2026-01-20', NULL, NULL, 'Vergel', '3232320347', 'andrearq24@hotmail.com', NULL, NULL),
(428, 'Julian David Gomez Prada', '2025-12-18', '2026-01-18', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1106226157', '2004-03-08', NULL, 'M', '2025-12-26', NULL, NULL, 'Ambalá', '3158776924', 'jdgomez082004@gmail.com', NULL, NULL),
(429, 'Jhon Alejando Bravo Chicunque', '2025-12-20', '2026-01-20', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1110594954', '1998-12-01', NULL, 'M', '2025-12-23', NULL, NULL, 'Ambalá', '3043082125', 'jhones40@hotmail.com', NULL, NULL),
(430, 'Salome Avila Araque', '2026-01-13', '2026-02-13', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', 'TI 1188216996', '2012-03-22', NULL, 'F', '2026-01-20', NULL, NULL, 'Vergel', '3232320347', 'andrearq24@hotmail.com', NULL, NULL),
(431, 'Pablo Emilio Artunduaga Reyes', '2026-01-06', '2026-02-06', 'Experiencia Fitness plan básico + Personalizado', 'ACTIVO', '14225982', '1956-02-28', NULL, 'M', '2026-01-06', NULL, NULL, 'Vergel', '3006207630', 'pear@grupocarolina.com', NULL, NULL),
(432, 'Andrea Rojas Navarro', '2026-01-06', '2026-02-06', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1110533332', '1993-03-15', NULL, 'F', '2026-01-13', NULL, NULL, 'Ambalá', '3187932218', 'andre_rojaz@hotmail.com', NULL, NULL),
(433, 'Davidson Mauricio Rodriguez Medina', '2026-01-14', '2026-02-14', 'Experiencia Fitness plan básico+personalizado', 'ACTIVO', '1110533620', '1993-02-24', NULL, 'M', '2026-01-07', NULL, NULL, 'Balcones del Campestre', '3176494909', 'reydavo24@hotmail.com', NULL, NULL),
(434, 'Sammuel Vejarano Rincón', '2026-01-08', '2026-02-08', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', 'TI 1104950511', '2012-11-06', NULL, 'M', '2026-01-14', NULL, NULL, 'Condominio Tierra Linda', '3005380930', 'handreita103@hotmail.com', NULL, NULL),
(435, 'Dora Patricia Montaña Puerta', '2026-01-14', '2026-02-14', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '28555390', '1982-07-03', NULL, 'F', NULL, NULL, NULL, 'Vergel', '3183639100', 'doritap_2010@hotmail.com', NULL, NULL),
(436, 'Juan Sebastian Casas Montaña', '2026-01-14', '2026-01-14', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', 'TI 1105469644', '2009-06-11', NULL, 'M', NULL, NULL, NULL, 'Vergel', '3054647986', 'jack9226.sebas.casas@gmail.com', NULL, NULL),
(437, 'Andres Ortíz Durán', '2026-01-07', '2026-02-07', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1110493298', '1990-01-28', NULL, 'M', NULL, NULL, NULL, '', '3133665270', 'andresortiz2890@gmail.com', NULL, NULL),
(438, 'Milagros Chacón', '2026-01-14', '2026-02-14', 'EXPERIENCIA FITNESS PLAN BÁSICO + PERSONALIZADO PAREJA', 'ACTIVO', '5255218', '1975-12-11', NULL, 'F', NULL, NULL, NULL, '', '3206389524', 'milachacon1112@gmail.com', NULL, NULL),
(439, 'Danyela Yayveth Esteban Chacón', '2026-01-14', '2026-02-14', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '27280952', '2000-02-25', NULL, 'F', NULL, NULL, NULL, '', '3124087734', 'danyelayestebanchacon@gmail.com', NULL, NULL),
(440, 'Juan Sebastian Rodriguez Gomez', '2026-01-15', '2026-02-15', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1053805708', '1990-10-10', NULL, 'M', NULL, NULL, NULL, 'Prados del Norte', '3208018628', 'jserogo@hotmail.com', NULL, NULL),
(441, 'Esteban Lopez Gomez', '2026-01-15', '2026-02-15', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '10778091', '1983-08-28', NULL, 'M', NULL, NULL, NULL, 'Prado del Norte', '3137906054', 'eslogo285@gmail.com', NULL, NULL),
(442, 'Diana Magaly Gonzalez Ortigoza', '2026-01-15', '2026-02-15', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '28698209', '1971-01-04', NULL, 'F', NULL, NULL, NULL, 'Vergel', '3152057974', 'diana0401gonzalez@gmail.com', NULL, NULL),
(443, 'Sebastian aldana Jimenez', '2026-01-14', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1104939883', '2006-08-01', NULL, 'M', NULL, NULL, NULL, 'Samaria', '3157317731', 'aldanasebastian142@gmail.com', NULL, NULL),
(444, 'Nathalia Díaz', '2026-01-14', NULL, 'Tiquetera', 'ACTIVO', '65634827', '1985-06-04', NULL, 'F', NULL, NULL, NULL, '', '3013781628', 'n.diazc@hotmail.com', NULL, NULL),
(445, 'Regina Castrillon Toro', '2026-01-14', NULL, 'TIQUETERA PERSONALIZADA 10 SESIONES', 'ACTIVO', '42967279', '1955-10-08', NULL, 'M', NULL, NULL, NULL, 'Santa Elena', '3104800492', 'n.diazc@hotmail.com', NULL, NULL),
(446, 'Juan Carlos Valbuena', '2026-01-14', '2026-02-14', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '93381557', '1970-03-26', NULL, 'M', '2026-01-14', NULL, NULL, 'Parrales', '3152549180', 'j.c.valbuena@hotmail.com', NULL, NULL),
(447, 'Juliana Villalba', '2026-01-15', '2026-02-15', 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '1110445682', '1986-05-11', NULL, 'F', NULL, NULL, NULL, 'Conjunto Galatai', '3115781727', 'julianavillalba@gmail.com', NULL, NULL),
(448, 'Oscar Ivan Londoño Zapata', '2026-01-14', NULL, 'EXPERIENCIA FITNESS PLAN BÁSICO', 'ACTIVO', '14138270', '1984-05-04', NULL, 'M', '2026-01-19', NULL, NULL, '', '3156085825', 'oscar.londono84@gmail.com', NULL, NULL);

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
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT de la tabla `Appointments`
--
ALTER TABLE `Appointments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=442;

--
-- AUTO_INCREMENT de la tabla `Staff`
--
ALTER TABLE `Staff`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT de la tabla `Users`
--
ALTER TABLE `Users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=449;

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
